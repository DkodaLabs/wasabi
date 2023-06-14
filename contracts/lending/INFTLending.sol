// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

/// @notice NFTLending Interface
interface INFTLending {
    /// @notice Borrow WETH from the protocol
    /// @param inputData Encoded input parameters
    /// @return loanId The loan id
    function borrow(bytes calldata inputData) external returns (uint256 loanId);

    /// @notice Repay the loan
    /// @param loanId The loan id to repay
    function repay(uint256 loanId) external;
}
