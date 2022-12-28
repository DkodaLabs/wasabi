// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.4.25 <0.9.0;

interface IWasabiPoolFactory {
    event NewPool(address poolAddress, address indexed commodityAddress, address indexed owner);

    function issueOption(address _target) external returns (uint256);

    function burnOption(uint256 _optionId) external;
}