// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "./NFTLendingBase.sol";
import "./interfaces/x2y2/IXY3.sol";

/// @title X2Y2 Lending
/// @notice Manages creating and repaying a loan on X2Y2
contract X2Y2Lending is NFTLendingBase {
    using SafeERC20 for IERC20;

    /// @notice X2Y2 XY3 Contract
    IXY3 public immutable xy3;

    /// @notice X2Y2Lending Constructor
    /// @param _xy3 XY3 contract address
    constructor(address _globalBNPL, IXY3 _xy3) NFTLendingBase(_globalBNPL) {
        xy3 = _xy3;
    }

    /// @inheritdoc INFTLending
    function borrow(
        bytes calldata _inputData
    ) external onlyBNPL returns (uint256) {
        // Decode `inputData` into Offer, Signature and BorrowerSettings
        (
            IXY3.Offer memory offer,
            uint256 nftId,
            bool isCollectionOffer,
            IXY3.Signature memory lenderSignature,
            IXY3.Signature memory brokerSignature,
            IXY3.CallData memory extraDeal
        ) = abi.decode(
                _inputData,
                (
                    IXY3.Offer,
                    uint256,
                    bool,
                    IXY3.Signature,
                    IXY3.Signature,
                    IXY3.CallData
                )
            );

        IERC721 nft = IERC721(offer.nftAsset);

        // Transfer NFT from BNPL contract
        nft.safeTransferFrom(msg.sender, address(this), nftId);

        // Approve
        nft.setApprovalForAll(address(xy3), true);

        // Borrow on X2Y2
        uint32 loanId = xy3.borrow(
            offer,
            nftId,
            isCollectionOffer,
            lenderSignature,
            brokerSignature,
            extraDeal
        );

        // Return loan id
        return uint256(loanId);
    }

    /// @inheritdoc INFTLending
    function repay(uint256 _loanId) external onlyBNPL {
        uint32 loanId = uint32(_loanId);

        // Get LoanDetail for loanId
        IXY3.LoanDetail memory loanDetail = xy3.loanDetails(loanId);

        // Transfer payment from BNPL
        IERC20 token = IERC20(loanDetail.borrowAsset);
        token.safeTransferFrom(
            msg.sender,
            address(this),
            loanDetail.repayAmount
        );

        // Approve token to `xy3`
        token.safeApprove(address(xy3), 0);
        token.safeApprove(address(xy3), loanDetail.repayAmount);

        // Pay back loan
        xy3.repay(loanId);

        // Transfer collateral NFT to BNPL
        IERC721(loanDetail.nftAsset).safeTransferFrom(
            address(this),
            msg.sender,
            loanDetail.nftTokenId
        );
    }
}
