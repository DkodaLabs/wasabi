// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "./interfaces/IFlashloan.sol";

contract Flashloan is IFlashloan {
    /// @notice Enabled flashloaners
    mapping(address => FlashLoanInfo) enabledFlashLoaners;

    modifier onlyEnabledBorrower() {
        require(
            enabledFlashLoaners[msg.sender].enabled == true,
            "Borrower not enabled"
        );
        _;
    }

    /// @inheritdoc IFlashloan
    function flashloan(uint256 amount) external onlyEnabledBorrower returns (uint256 premium) {
        (bool success, ) = msg.sender.call{value: amount}("");
        if (!success) {
            revert EthTransferFailed();
        }

        premium = enabledFlashLoaners[msg.sender].flashloanPremiumValue;
    }

    receive() external payable {}
}
