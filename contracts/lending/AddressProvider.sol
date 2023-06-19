// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";

import "./interfaces/IAddressProvider.sol";

/// @title Address Provider
/// @notice Manages addresses across Wasabi lending
contract AddressProvider is Ownable, IAddressProvider {
    mapping(bytes32 => address) private _addresses;

    bytes32 private constant NFTFI_LENDING = "NFTFI_LENDING";
    bytes32 private constant X2Y2_LENDING = "X2Y2_LENDING";

    /// @notice Returns NFTfiLending contract address
    function getNFTfiLending() external view returns (address) {
        return _addresses[NFTFI_LENDING];
    }

    /// @notice Update NFTfiLending contract address
    /// @param _nftfiLending New NFTfiLending contract address
    function setNFTfiLending(address _nftfiLending) external onlyOwner {
        require(_nftfiLending != address(0), "zero address");
        _addresses[NFTFI_LENDING] = _nftfiLending;

        emit NFTfiLendingUpdated(_nftfiLending);
    }

    /// @notice Returns X2Y2Lending contract address
    function getX2Y2Lending() external view returns (address) {
        return _addresses[X2Y2_LENDING];
    }

    /// @notice Update X2Y2Lending contract address
    /// @param _x2y2Lending New X2Y2Lending contract address
    function setX2Y2Lending(address _x2y2Lending) external onlyOwner {
        require(_x2y2Lending != address(0), "zero address");
        _addresses[X2Y2_LENDING] = _x2y2Lending;

        emit X2Y2LendingUpdated(_x2y2Lending);
    }
}
