// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

import "./interfaces/IFlashloan.sol";

contract Flashloan is IFlashloan, Ownable {
    /// @notice Enabled flashloaners
    mapping(address => FlashLoanInfo) enabledFlashLoaners;

    /// @notice Flashloan premium fraction
    uint256 public immutable flashloanPremiumFraction;

    modifier onlyEnabledBorrower() {
        require(
            enabledFlashLoaners[_msgSender()].enabled == true,
            "Borrower not enabled"
        );
        _;
    }

    constructor() {
        flashloanPremiumFraction = 10_000;
    }

    /// @notice Enable Flashloaner
    /// @param loaner Flashloaner address
    /// @param enabled Enabled flag
    /// @param flashloanPremiumValue Flashloan premium ratio
    function enableFlashloaner(
        address loaner,
        bool enabled,
        uint256 flashloanPremiumValue
    ) external onlyOwner {
        enabledFlashLoaners[loaner] = FlashLoanInfo({
            enabled: enabled,
            flashloanPremiumValue: flashloanPremiumValue
        });
    }

    /// @inheritdoc IFlashloan
    function borrow(
        uint256 amount
    ) external onlyEnabledBorrower returns (uint256 flashLoanRepayAmount) {
        (bool success, ) = _msgSender().call{value: amount}("");
        if (!success) {
            revert EthTransferFailed();
        }

        uint256 loanPremium = (amount *
            enabledFlashLoaners[_msgSender()].flashloanPremiumValue) /
            flashloanPremiumFraction;
        flashLoanRepayAmount = amount + loanPremium;
    }

    /// @dev withdraws any stuck eth in this contract
    function withdrawETH(uint256 amount) external payable onlyOwner {
        require(amount <= address(this).balance, "Invalid amount");
        address payable to = payable(owner());
        to.transfer(amount);
    }

    /// @dev withdraws any stuck ERC20 in this contract
    function withdrawERC20(IERC20 token, uint256 amount) external onlyOwner {
        token.transfer(msg.sender, amount);
    }

    /// @dev withdraws any stuck ERC721 in this contract
    function withdrawERC721(
        IERC721 token,
        uint256 tokenId
    ) external onlyOwner {
        token.safeTransferFrom(address(this), owner(), tokenId);
    }

    receive() external payable {}
}
