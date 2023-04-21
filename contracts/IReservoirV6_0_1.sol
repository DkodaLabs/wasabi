// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.19;

import "./lib/WasabiStructs.sol";

interface IReservoirV6_0_1 {

  function execute(
    WasabiStructs.ExecutionInfo[] calldata executionInfos
  ) external payable;
}