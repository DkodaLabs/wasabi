// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.4.25 <0.9.0;
import "./lib/WasabiStructs.sol";

interface IWasabiConduit {
    function poolAcceptBid(WasabiStructs.Bid calldata _bid, bytes calldata _signature) external;
}