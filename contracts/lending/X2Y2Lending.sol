// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "./interfaces/INFTLending.sol";
import "./interfaces/x2y2/IXY3.sol";
import {IWETH} from "../IWETH.sol";

/// @title X2Y2 Lending
/// @notice Manages creating and repaying a loan on X2Y2
contract X2Y2Lending is INFTLending {
    using SafeERC20 for IERC20;

    /// @notice XY3 Contract
    IXY3 public constant xy3 = IXY3(0xFa4D5258804D7723eb6A934c11b1bd423bC31623);

    /// @notice WETH Contract
    IWETH public constant weth =
        IWETH(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);

    /// @inheritdoc INFTLending
    function getLoanDetails(
        uint256 _loanId
    ) external view returns (LoanDetails memory loanDetails) {
        uint32 loanId = uint32(_loanId);

        // Get LoanDetail for loanId
        IXY3.LoanDetail memory loanDetail = xy3.loanDetails(loanId);

        loanDetails.borrowAmount = loanDetail.borrowAmount;
        loanDetails.repayAmount = loanDetail.repayAmount;
        loanDetails.loanExpiration = loanDetail.loanStart + loanDetail.loanDuration;
    }

    /// @inheritdoc INFTLending
    function getNFTDetails(
        uint256 _loanId
    ) external view returns (address, uint256) {
        uint32 loanId = uint32(_loanId);

        // Get LoanDetail for loanId
        IXY3.LoanDetail memory loanDetail = xy3.loanDetails(loanId);

        return (loanDetail.nftAsset, loanDetail.nftTokenId);
    }

    /// @inheritdoc INFTLending
    function borrow(
        bytes calldata _inputData
    ) external payable returns (uint256) {
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

        // Unwrap WETH into ETH
        weth.withdraw(offer.borrowAmount);

        // Return loan id
        return uint256(loanId);
    }

    /// @inheritdoc INFTLending
    function repay(uint256 _loanId, address _receiver) external payable {
        uint32 loanId = uint32(_loanId);

        // Get LoanDetail for loanId
        IXY3.LoanDetail memory loanDetail = xy3.loanDetails(loanId);

        // Wrap ETH into WETH
        weth.deposit{value: loanDetail.repayAmount}();

        // Approve token to `xy3`
        IERC20 token = IERC20(loanDetail.borrowAsset);
        token.safeApprove(address(xy3), 0);
        token.safeApprove(address(xy3), loanDetail.repayAmount);

        // Pay back loan
        xy3.repay(loanId);

        // Transfer collateral NFT to the user
        IERC721(loanDetail.nftAsset).safeTransferFrom(
            address(this),
            _receiver,
            loanDetail.nftTokenId
        );
    }

    receive() external payable {}
}
