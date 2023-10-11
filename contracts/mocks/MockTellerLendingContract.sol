// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "../lending/teller/CollateralManager.sol";
import "../lending/teller/IMarketRegistry.sol";
import "../lending/teller/ITellerV2.sol";
import "../lending/teller/LenderCommitmentForwarder.sol";
import "./MockLending.sol";
import "../IWETH.sol";

contract MockTellerLendingContract is
    MockLending,
    CollateralManager,
    IMarketRegistry,
    ITellerV2,
    LenderCommitmentForwarder
{
    event NewLoanWithProof(address nft, uint256 tokenId, uint256 principal, uint256 repayment, uint256 duration);

    mapping(uint256 => mapping(address => address)) private marketForwarders;

    constructor(address _wethAddress) MockLending(_wethAddress) {}

    function getCollateralInfo(
        uint256 _bidId
    ) external view returns (Collateral[] memory infos_) {
        infos_ = new Collateral[](1);
        infos_[0] = Collateral(
            CollateralType.ERC721,
            1,
            loans[_bidId].nftId,
            loans[_bidId].nft
        );
    }

    function getMarketplaceFee(uint256) external view override returns (uint16) {
        return 5;
    }

    function approveMarketForwarder(
        uint256 _marketId,
        address _forwarder
    ) external override {
        marketForwarders[_marketId][msg.sender] = _forwarder;
    }

    function calculateAmountOwed(
        uint256 _bidId,
        uint256 _timestamp
    ) external view override returns (Payment memory owed) {
        return Payment(
            loans[_bidId].loanAmount,
            loans[_bidId].repayment - loans[_bidId].loanAmount
        );
    }

    function calculateNextDueDate(
        uint256 _bidId
    ) external view override returns (uint32 dueDate_) {
        dueDate_ = (uint32) (loans[_bidId].expiration);
    }

    function collateralManager() external view override returns (address) {
        return address(this);
    }

    function hasApprovedMarketForwarder(
        uint256 _marketId,
        address _forwarder,
        address _account
    ) external view override returns (bool) {
        return marketForwarders[_marketId][_account] == _forwarder;
    }

    function lenderCommitmentForwarder()
        external
        view
        override
        returns (address)
    {
        return address(this);
    }

    function marketRegistry() external view override returns (address) {
        return address(this);
    }

    function protocolFee() external view override returns (uint16) {
        return 5;
    }

    function repayLoanFull(uint256 _bidId) external override {
        repay(_bidId);
    }

    function acceptCommitment(
        uint256 _commitmentId,
        uint256 _principalAmount,
        uint256 _collateralAmount,
        uint256 _collateralTokenId,
        address _collateralTokenAddress,
        uint16 _interestRate,
        uint32 _loanDuration
    ) external override returns (uint256 bidId) {
        uint256 yearlyInterest = _principalAmount * _interestRate / 10000;
        uint256 interest = yearlyInterest / (365 * 24 * 60 * 60) * _loanDuration;

        bidId = ++loanIdTracker;
        loans[bidId] = Loan({
            nft: _collateralTokenAddress,
            nftId: _collateralTokenId,
            currency: wethAddress,
            loanAmount: _principalAmount,
            repayment: _principalAmount + interest,
            expiration: block.timestamp + _loanDuration
        });

        IERC721(_collateralTokenAddress).safeTransferFrom(_msgSender(), address(this), _collateralTokenId);
        IERC20(wethAddress).transfer(_msgSender(), _principalAmount);

        emit NewLoan(
            loans[bidId].nft,
            loans[bidId].nftId,
            loans[bidId].loanAmount,
            loans[bidId].repayment,
            loans[bidId].expiration
        );
    }

    function acceptCommitmentWithProof(
        uint256 _commitmentId,
        uint256 _principalAmount,
        uint256 _collateralAmount,
        uint256 _collateralTokenId,
        address _collateralTokenAddress,
        uint16 _interestRate,
        uint32 _loanDuration,
        bytes32[] calldata _merkleProof
    ) external override returns (uint256 bidId) {
        require(_merkleProof.length > 0, 'Empty merkle proof supplied');

        uint256 yearlyInterest = _principalAmount * _interestRate / 10000;
        uint256 interest = yearlyInterest / (365 * 24 * 60 * 60) * _loanDuration;

        bidId = ++loanIdTracker;
        loans[bidId] = Loan({
            nft: _collateralTokenAddress,
            nftId: _collateralTokenId,
            currency: wethAddress,
            loanAmount: _principalAmount,
            repayment: _principalAmount + interest,
            expiration: block.timestamp + _loanDuration
        });

        IERC721(_collateralTokenAddress).safeTransferFrom(_msgSender(), address(this), _collateralTokenId);
        IERC20(wethAddress).transfer(_msgSender(), _principalAmount);

        emit NewLoanWithProof(
            loans[bidId].nft,
            loans[bidId].nftId,
            loans[bidId].loanAmount,
            loans[bidId].repayment,
            loans[bidId].expiration
        );
    }

    receive() external payable {
        IWETH(wethAddress).deposit{value: msg.value}();
    }
}