// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

/// @notice NFTLending Interface
interface INFTLending {
    /// @notice Borrow WETH from the protocol
    /// @param _inputData Encoded input parameters
    /// @return _loanId The loan id
    function borrow(
        bytes calldata _inputData
    ) external payable returns (uint256 _loanId);

    /// @notice Repay the loan
    /// @param _loanId The loan id to repay
    /// @param _receiver The user address to receive collateral NFT
    function repay(uint256 _loanId, address _receiver) external;
}
