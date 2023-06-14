// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

/// @notice NFTLending Interface
interface INFTLending {
    /// @notice Borrow WETH from the protocol
    /// @param inputs Encoded input parameters
    function borrow(bytes calldata inputs) external;
}
