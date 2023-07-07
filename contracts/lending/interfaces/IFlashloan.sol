// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

/// @title Flashloan Interface
interface IFlashloan {
    /// @notice Flashloan Info Struct
    /// @param enabled Enabled flag
    /// @param flashloanPremiumValue;
    struct FlashLoanInfo {
        bool enabled;
        uint256 flashloanPremiumValue;
    }

    /// @notice ETH Transfer Failed
    error EthTransferFailed();

    /// @notice Get flashloan
    /// @param amount Flashloan amount
    /// @return premium Flashloan premium value
    function flashloan(uint256 amount) external returns (uint256 premium);
}
