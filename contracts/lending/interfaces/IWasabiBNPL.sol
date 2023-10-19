// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "../../lib/WasabiStructs.sol";

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

    /// @notice Loan Info Struct
    /// @param nftLending INFTLending address
    /// @param loanId loan id
    struct LoanInfo {
        address nftLending;
        uint256 loanId;
    }

    /// @notice Function Call Failed
    error FunctionCallFailed();

    /// @notice Loan Not Paid
    error LoanNotPaid();

    /// @notice ETH Transfer Failed
    error EthTransferFailed();

    /// @notice Invalid Param
    error InvalidParam();

    /// @dev Emitted when an option is executed
    event OptionExecuted(uint256 optionId);

    /// @dev Emitted when an option is executed and the NFT is sold to the market
    event OptionExecutedWithArbitrage(uint256 optionId, uint256 payout);

    /// @dev returns the OptionData for the given option id
    function getOptionData(uint256 _optionId) external view returns (WasabiStructs.OptionData memory optionData);

    /// @notice Buys an NFT from the market and places it in a loan
    function bnpl(
        address _nftLending,
        bytes calldata _borrowData,
        uint256 _flashLoanAmount,
        FunctionCallData[] calldata _marketplaceCallData,
        bytes[] calldata _signatures
    ) external payable returns (uint256);

    /// @dev executes the given option
    function executeOption(uint256 _optionId) external payable;

    /// @dev executes the given option and trades the underlying NFT to collect a payout
    function executeOptionWithArbitrage(
        uint256 _optionId,
        FunctionCallData[] calldata _marketplaceCallData,
        bytes[] calldata _signatures
    ) external payable;
}
