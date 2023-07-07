// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";

import "./interfaces/IFlashloan.sol";

contract Flashloan is IFlashloan, Ownable {
    /// @notice Enabled flashloaners
    mapping(address => FlashLoanInfo) enabledFlashLoaners;

    /// @notice Flashloan premium fraction
    uint256 public immutable flashloanPremiumFraction;

    modifier onlyEnabledBorrower() {
        require(
            enabledFlashLoaners[msg.sender].enabled == true,
            "Borrower not enabled"
        );
        _;
    }

    constructor() {
        flashloanPremiumFraction = 10_000;
    }

    /// @notice Enable Flashloaner
    /// @param loaner Flashloaner address
    /// @param flashloanPremiumValue Flashloan premium ratio
    function enableFlashloaner(
        address loaner,
        uint256 flashloanPremiumValue
    ) external onlyOwner {
        enabledFlashLoaners[loaner] = FlashLoanInfo({
            enabled: true,
            flashloanPremiumValue: flashloanPremiumValue
        });
    }

    /// @inheritdoc IFlashloan
    function borrow(
        uint256 amount
    ) external onlyEnabledBorrower returns (uint256 flashLoanRepayAmount) {
        (bool success, ) = msg.sender.call{value: amount}("");
        if (!success) {
            revert EthTransferFailed();
        }

        uint256 loanPremium = (amount *
            enabledFlashLoaners[msg.sender].flashloanPremiumValue) /
            flashloanPremiumFraction;
        flashLoanRepayAmount = amount + loanPremium;
    }

    receive() external payable {}
}
