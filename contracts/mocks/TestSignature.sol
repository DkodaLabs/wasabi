// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.4.25 <0.9.0;

import "../lib/WasabiStructs.sol";
import "../lib/Signing.sol";

contract TestSignature {
    function getSigner(
        WasabiStructs.OptionRequest calldata _request,
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