// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "../lib/WasabiStructs.sol";
import "../lib/Signing.sol";

contract TestSignature {
    function getSigner(
        WasabiStructs.PoolAsk calldata _request,
        bytes memory signature
    ) public pure returns (address) {
        return Signing.getSigner(_request, signature);
    }

    function getAskHash(
        WasabiStructs.Ask calldata _ask
    ) public pure returns (bytes32) {
        return Signing.getAskHash(_ask);
    }

    function getAskSigner(
        WasabiStructs.Ask calldata _ask,
        bytes memory signature
    ) public pure returns (address) {
        return Signing.getAskSigner(_ask, signature);
    }
}