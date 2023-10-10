// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

import "../../IWETH.sol";
import "../interfaces/INFTLending.sol";
import "./LenderCommitmentForwarder.sol";
import "./CollateralManager.sol";
import "./ITellerV2.sol";

contract TellerLending is INFTLending {

    IWETH public immutable weth;
    ITellerV2 public immutable loansCore;

    constructor(IWETH _weth, ITellerV2 _loansCore) {
        weth = _weth;
        loansCore = _loansCore;
    }

    /// @inheritdoc INFTLending
    function getLoanDetails(
        uint256 _loanId
    ) external view returns (LoanDetails memory loanDetails) {
        CollateralManager.Collateral memory collateral = CollateralManager(loansCore.collateralManager()).getCollateralInfo(_loanId)[0];
        uint32 expiry = loansCore.calculateNextDueDate(_loanId);
        ITellerV2.Payment memory amountDue = loansCore.calculateAmountDue(_loanId, expiry);

        loanDetails = LoanDetails(
            amountDue.principal,
            amountDue.principal + amountDue.interest,
            expiry,
            collateral._collateralAddress,
            collateral._tokenId
        );
    }

        /// @inheritdoc INFTLending
    function borrow(
        bytes calldata _inputData
    ) external payable returns (uint256 loanId) {
        address lenderCommitmentForwarder = loansCore.lenderCommitmentForwarder();

        // 1. Decode
        (
            uint256 _commitmentId,
            uint256 _principalAmount,
            uint256 _collateralAmount,
            uint256 _collateralTokenId,
            address _collateralTokenAddress,
            uint16 _interestRate,
            uint32 _loanDuration,
            bytes32[] memory _merkleProof
        ) = abi.decode(
            _inputData,
            (uint256, uint256, uint256, uint256, address, uint16, uint32, bytes32[]));

        // 2. Approve NFT Transfer
        IERC721 nft = IERC721(_collateralTokenAddress);
        if (!nft.isApprovedForAll(address(this), lenderCommitmentForwarder)) {
            nft.setApprovalForAll(lenderCommitmentForwarder, true);
        }

        // 3. Approve market forwarder
        uint256 marketId = loansCore.getLoanMarketId(loanId);
        if (!loansCore.hasApprovedMarketForwarder(marketId, lenderCommitmentForwarder, address(this))) {
            loansCore.approveMarketForwarder(marketId, lenderCommitmentForwarder);
        }

        // 4. Take out loan
        if (_merkleProof.length > 0) {
            loanId = LenderCommitmentForwarder(lenderCommitmentForwarder).acceptCommitmentWithProof(
                _commitmentId,
                _principalAmount,
                _collateralAmount,
                _collateralTokenId,
                _collateralTokenAddress,
                _interestRate,
                _loanDuration, 
                _merkleProof
            );
        } else {
            loanId = LenderCommitmentForwarder(lenderCommitmentForwarder).acceptCommitment(
                _commitmentId,
                _principalAmount,
                _collateralAmount,
                _collateralTokenId,
                _collateralTokenAddress,
                _interestRate,
                _loanDuration);
        }

        // 5. Unwrap WETH into ETH
        weth.withdraw(_principalAmount);
    }

    /// @inheritdoc INFTLending
    function repay(uint256 _loanId, address _receiver) external payable {
        // 1. Calculate amount
        ITellerV2.Payment memory payment = loansCore.calculateAmountDue(_loanId, block.timestamp);
        uint256 repayAmount = payment.interest + payment.principal;
        CollateralManager.Collateral memory collateral = CollateralManager(loansCore.collateralManager()).getCollateralInfo(_loanId)[0];

        // 2. Deposit and approve WETH
        weth.deposit{value: repayAmount}();
        weth.approve(address(loansCore), repayAmount);

        // 3. Repay loan
        loansCore.repayLoanFull(_loanId);

        // 4. Transfer collateral NFT to the user
        if (_receiver != address(this)) {
            IERC721(collateral._collateralAddress).safeTransferFrom(
                address(this),
                _receiver,
                collateral._tokenId
            );
        }
    }

    receive() external payable {}
}