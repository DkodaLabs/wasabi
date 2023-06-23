// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

/// @title WasabiBNPL Interface
interface IWasabiBNPL {
    /// @notice Function Calldata Struct
    /// @param to to address
    /// @param value call value
    /// @param data call data
    struct FunctionCallData {
        address to;
        uint256 value;
        bytes data;
    }

    /// @notice Insufficient Balance
    error InsufficientBalance();

    /// @notice Function Call Failed
    error FunctionCallFailed();

    /// @notice Loan Not Paid
    error LoanNotPaid();

    /// @notice ETH Transfer Failed
    error EthTransferFailed();

    /// @notice Borrow Failed
    error BorrowFailed();

    /// @notice Invalid Param
    error InvalidParam();
}
