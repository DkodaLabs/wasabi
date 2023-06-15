// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "./NFTLendingBase.sol";
import "./interfaces/nftfi/IDirectLoanFixedCollectionOffer.sol";
import "./interfaces/nftfi/IDirectLoanCoordinator.sol";

/// @title NFTfi Lending
/// @notice Manages creating and repaying a loan on NFTfi
contract NFTfiLending is NFTLendingBase {
    using SafeERC20 for IERC20;

    /// @notice NFTfi DirectLoanFixedCollectionOffer Contract
    IDirectLoanFixedCollectionOffer
        public immutable directLoanFixedCollectionOffer;

    /// @notice NFTfi DirectLoanCoordinator Contract
    IDirectLoanCoordinator public immutable directLoanCoordinator;

    /// @notice NFTFILending Constructor
    /// @param _directLoanFixedCollectionOffer DirectLoanFixedCollectionOffer contract address
    constructor(
        address _globalBNPL,
        IDirectLoanFixedCollectionOffer _directLoanFixedCollectionOffer,
        IDirectLoanCoordinator _directLoanCoordinator
    ) NFTLendingBase(_globalBNPL) {
        directLoanFixedCollectionOffer = _directLoanFixedCollectionOffer;
        directLoanCoordinator = _directLoanCoordinator;
    }

    /// @inheritdoc INFTLending
    function borrow(
        bytes calldata _inputData
    ) external onlyBNPL returns (uint256) {
        // Decode `inputData` into Offer, Signature and BorrowerSettings
        (
            IDirectLoanFixedCollectionOffer.Offer memory offer,
            IDirectLoanFixedCollectionOffer.Signature memory signature,
            IDirectLoanFixedCollectionOffer.BorrowerSettings
                memory borrowerSettings
        ) = abi.decode(
                _inputData,
                (
                    IDirectLoanFixedCollectionOffer.Offer,
                    IDirectLoanFixedCollectionOffer.Signature,
                    IDirectLoanFixedCollectionOffer.BorrowerSettings
                )
            );

        IERC721 nft = IERC721(offer.nftCollateralContract);
        uint256 nftId = offer.nftCollateralId;

        // Transfer NFT from BNPL contract
        nft.safeTransferFrom(msg.sender, address(this), nftId);

        // Approve
        nft.setApprovalForAll(address(directLoanFixedCollectionOffer), true);

        // Accetp offer on NFTfi
        directLoanFixedCollectionOffer.acceptOffer(
            offer,
            signature,
            borrowerSettings
        );

        // Return loan id
        return uint256(directLoanCoordinator.totalNumLoans());
    }

    /// @inheritdoc INFTLending
    function repay(uint256 _loanId) external onlyBNPL {
        uint32 loanId = uint32(_loanId);

        // Get LoanTerms for loanId
        IDirectLoanFixedCollectionOffer.LoanTerms
            memory loanTerms = directLoanFixedCollectionOffer.loanIdToLoan(
                loanId
            );

        // Transfer payment from BNPL
        IERC20 token = IERC20(loanTerms.loanERC20Denomination);
        token.safeTransferFrom(
            msg.sender,
            address(this),
            loanTerms.maximumRepaymentAmount
        );

        // Approve token to `directLoanFixedCollectionOffer`
        token.safeApprove(address(directLoanFixedCollectionOffer), 0);
        token.safeApprove(
            address(directLoanFixedCollectionOffer),
            loanTerms.maximumRepaymentAmount
        );

        // Pay back loan
        directLoanFixedCollectionOffer.payBackLoan(loanId);

        // Transfer collateral NFT to BNPL
        IERC721(loanTerms.nftCollateralContract).safeTransferFrom(
            address(this),
            msg.sender,
            loanTerms.nftCollateralId
        );
    }
}
