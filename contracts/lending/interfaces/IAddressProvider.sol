// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

interface IAddressProvider {
    event NFTfiLendingUpdated(address indexed newAddress);
    event X2Y2LendingUpdated(address indexed newAddress);

    function getNFTfiLending() external view returns (address);

    function setNFTfiLending(address _nftfiLending) external;

    function getX2Y2Lending() external view returns (address);

    function setX2Y2Lending(address _x2y2Lending) external;
}
