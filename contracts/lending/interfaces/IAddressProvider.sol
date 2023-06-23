// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

interface IAddressProvider {
    event LendingAdded(address indexed newAddress);

    function isLending(address) external view returns (bool);

    function addLending(address _lending) external;
}
