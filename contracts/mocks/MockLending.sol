// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

contract MockLending is IERC721Receiver {
    using SafeERC20 for IERC20;

    struct Loan {
        address nft;
        uint256 nftId;
        address currency;
        uint256 loanAmount;
        uint256 repayment;
        uint256 expiration;
    }

    uint256 private loanIdTracker;
    mapping(uint256 => Loan) public loans;

    address private wethAddress;

    constructor(address _wethAddress) {
        wethAddress = _wethAddress;
    }

    function borrow(
        bytes calldata _inputData
    ) external returns (uint256 loanId) {
        (
            address nft,
            uint256 nftId,
            uint256 loanAmount,
            uint256 repayment
        ) = abi.decode(_inputData, (address, uint256, uint256, uint256));
        loanId = ++loanIdTracker;
        loans[loanId] = Loan({
            nft: nft,
            nftId: nftId,
            currency: wethAddress,
            loanAmount: loanAmount,
            repayment: repayment,
            expiration: block.timestamp + 30 days
        });

        IERC721(nft).safeTransferFrom(msg.sender, address(this), nftId);
        IERC20(wethAddress).safeTransfer(msg.sender, loanAmount);
    }

    function repay(uint256 _loanId) external {
        Loan storage loan = loans[_loanId];
        IERC20(wethAddress).safeTransferFrom(
            msg.sender,
            address(this),
            loan.repayment
        );
        IERC721(loan.nft).safeTransferFrom(
            address(this),
            msg.sender,
            loan.nftId
        );
    }

    function onERC721Received(
        address /* operator */,
        address /* from */,
        uint256 /* tokenId */,
        bytes memory /* data */
    ) public virtual override returns (bytes4) {
        return this.onERC721Received.selector;
    }
}
