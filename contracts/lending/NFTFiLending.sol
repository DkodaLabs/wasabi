// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "./interfaces/INFTLending.sol";
import "./interfaces/nftfi/IDirectLoanFixedCollectionOffer.sol";
import "./interfaces/nftfi/IDirectLoanCoordinator.sol";
import {IWETH} from "../IWETH.sol";

/// @title NFTfi Lending
/// @notice Manages creating and repaying a loan on NFTfi
contract NFTfiLending is INFTLending {
    using SafeERC20 for IERC20;

    /// @notice DirectLoanFixedCollectionOffer Contract
    IDirectLoanFixedCollectionOffer
        public constant directLoanFixedCollectionOffer =
        IDirectLoanFixedCollectionOffer(
            0xE52Cec0E90115AbeB3304BaA36bc2655731f7934
        );

    /// @notice DirectLoanCoordinator Contract
    IDirectLoanCoordinator public constant directLoanCoordinator =
        IDirectLoanCoordinator(0x0C90C8B4aa8549656851964d5fB787F0e4F54082);

    /// @notice WETH Contract
    IWETH public constant weth =
        IWETH(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);

    /// @inheritdoc INFTLending
    function getLoanDetails(
        uint256 _loanId
    ) external view returns (LoanDetails memory) {
        uint32 loanId = uint32(_loanId);

        // Get LoanTerms for loanId
        IDirectLoanFixedCollectionOffer.LoanTerms
            memory loanTerms = directLoanFixedCollectionOffer.loanIdToLoan(
                loanId
            );

        return LoanDetails(
            loanTerms.loanPrincipalAmount, // borrowAmount
            loanTerms.maximumRepaymentAmount, // repayAmount
            loanTerms.loanStartTime + loanTerms.loanDuration, // loanExpiration
            loanTerms.nftCollateralContract, // nftAddress
            loanTerms.nftCollateralId // tokenId
        );
    }

    /// @inheritdoc INFTLending
    function borrow(
        bytes calldata _inputData
    ) external payable returns (uint256 loanId) {
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

        // Approve
        nft.setApprovalForAll(address(directLoanFixedCollectionOffer), true);

        // Accept offer on NFTfi
        directLoanFixedCollectionOffer.acceptOffer(
            offer,
            signature,
            borrowerSettings
        );

        loanId = uint256(directLoanCoordinator.totalNumLoans());

        // Get LoanTerms for loanId
        IDirectLoanFixedCollectionOffer.LoanTerms
            memory loanTerms = directLoanFixedCollectionOffer.loanIdToLoan(
                uint32(loanId)
            );

        // Unwrap WETH into ETH
        weth.withdraw(loanTerms.loanPrincipalAmount);
    }

    /// @inheritdoc INFTLending
    function repay(uint256 _loanId, address _receiver) external payable {
        uint32 loanId = uint32(_loanId);

        // Get LoanTerms for loanId
        IDirectLoanFixedCollectionOffer.LoanTerms
            memory loanTerms = directLoanFixedCollectionOffer.loanIdToLoan(
                loanId
            );

        // Wrap ETH into WETH
        weth.deposit{value: loanTerms.maximumRepaymentAmount}();

        // Approve token to `directLoanFixedCollectionOffer`
        IERC20 token = IERC20(loanTerms.loanERC20Denomination);
        token.safeApprove(address(directLoanFixedCollectionOffer), 0);
        token.safeApprove(
            address(directLoanFixedCollectionOffer),
            loanTerms.maximumRepaymentAmount
        );

        // Pay back loan
        directLoanFixedCollectionOffer.payBackLoan(loanId);
        
        if (_receiver != address(this)) {
            // Transfer collateral NFT to the user
            IERC721(loanTerms.nftCollateralContract).safeTransferFrom(
                address(this),
                _receiver,
                loanTerms.nftCollateralId
            );
        }
    }

    receive() external payable {}
}
