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
    IXY3 public constant xy3 = IXY3(0xB81965DdFdDA3923f292a47A1be83ba3A36B5133);

    /// @notice WETH Contract
    IWETH public constant weth =
        IWETH(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);

    /// @inheritdoc INFTLending
    function getLoanDetails(
        uint256 _loanId
    ) external view returns (LoanDetails memory loanDetails) {
        uint32 loanId = uint32(_loanId);

        // Get LoanInfo for loanId
        IXY3.LoanInfo memory loanInfo = xy3.getLoanInfo(loanId);

        loanDetails.borrowAmount = loanInfo.borrowAmount;
        loanDetails.repayAmount = loanInfo.payoffAmount;
        loanDetails.loanExpiration = loanInfo.maturityDate;
    }

    /// @inheritdoc INFTLending
    function getNFTDetails(
        uint256 _loanId
    ) external view returns (address, uint256) {
        uint32 loanId = uint32(_loanId);

        // Get LoanInfo for loanId
        IXY3.LoanInfo memory loanInfo = xy3.getLoanInfo(loanId);

        return (loanInfo.nftAsset, loanInfo.nftId);
    }

    /// @inheritdoc INFTLending
    function borrow(
        bytes calldata _inputData
    ) external payable returns (uint256) {
        // Decode `inputData` into Offer, Signature and BorrowerSettings
        (
            IXY3.Offer memory offer,
            uint256 nftId,
            IXY3.BrokerSignature memory brokerSignature,
            IXY3.CallData memory extraData
        ) = abi.decode(
                _inputData,
                (
                    IXY3.Offer,
                    uint256,
                    IXY3.BrokerSignature,
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
            brokerSignature,
            extraData
        );

        // Unwrap WETH into ETH
        weth.withdraw(offer.borrowAmount);

        // Return loan id
        return uint256(loanId);
    }

    /// @inheritdoc INFTLending
    function repay(uint256 _loanId, address _receiver) external payable {
        uint32 loanId = uint32(_loanId);

        // Get LoanInfo for loanId
        IXY3.LoanInfo memory loanInfo = xy3.getLoanInfo(loanId);

        // Wrap ETH into WETH
        weth.deposit{value: loanInfo.payoffAmount}();

        // Approve token to `xy3`
        IERC20 token = IERC20(loanInfo.borrowAsset);
        token.safeApprove(address(xy3), 0);
        token.safeApprove(address(xy3), loanInfo.payoffAmount);

        // Pay back loan
        xy3.repay(loanId);

        // Transfer collateral NFT to the user
        IERC721(loanInfo.nftAsset).safeTransferFrom(
            address(this),
            _receiver,
            loanInfo.nftId
        );
    }

    receive() external payable {}
}
