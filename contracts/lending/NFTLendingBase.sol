// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "./interfaces/INFTLending.sol";

/// @title NFT Lending Base
abstract contract NFTLendingBase is INFTLending {
    address public globalBNPL;

    event GlobalBNPLUpdated(
        address indexed oldGlobalBNPL,
        address indexed newGlobalBNPL
    );

    modifier onlyBNPL() {
        require(msg.sender == globalBNPL, "msg.sender != BNPL");
        _;
    }

    /// @notice NFTLendingBase Constructor
    /// @param _globalBNPL Global BNPL contract address
    constructor(address _globalBNPL) {
        require(_globalBNPL != address(0), "zero address");
        globalBNPL = _globalBNPL;
    }

    /// @notice Update global BNPL contract address. NOTE: Only current global BNPL can call this function.
    /// @param _globalBNPL New global BNPL contract address
    function updateGlobalBNPL(address _globalBNPL) external onlyBNPL {
        require(_globalBNPL != address(0), "zero address");
        address oldGlobalBNPL = globalBNPL;
        globalBNPL = _globalBNPL;

        emit GlobalBNPLUpdated(oldGlobalBNPL, _globalBNPL);
    }
}
