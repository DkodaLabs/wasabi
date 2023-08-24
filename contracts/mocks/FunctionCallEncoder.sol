// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

contract FunctionCallEncoder {
    struct FunctionCallData {
        address to;
        uint256 value;
        bytes data;
    }

    function encodeFunctionCall(
        FunctionCallData calldata functionCallData
    ) public pure returns (bytes32) {
        return keccak256(abi.encode(functionCallData.to, functionCallData.value, functionCallData.data));
    }
    

    function encodeFunctionCallSignedMessage(
        FunctionCallData calldata functionCallData
    ) public pure returns (bytes32) {
        return getEthSignedMessageHash(encodeFunctionCall(functionCallData));
    }
    /**
     * @dev creates an ETH signed message hash
     */
    function getEthSignedMessageHash(bytes32 _messageHash) internal pure returns (bytes32) {
        /*
        Signature is produced by signing a keccak256 hash with the following format:
        "\x19Ethereum Signed Message\n" + len(msg) + msg
        */
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", _messageHash));
    }
}