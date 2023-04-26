// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.19;

interface IWETH {
    function deposit() external payable;
    function transferFrom(address, address, uint256) external returns (bool);
    function withdraw(uint) external;
}
