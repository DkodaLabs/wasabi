// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.19;

library MockStructs {
    struct AMMOrder {
        address collection;
        uint256 price;
        uint256 orderExpiry;
    }

    /**
     * @dev Returns the message hash for the given request
     */
    function getMessageHash(AMMOrder calldata _order) external pure returns (bytes32) {
        return keccak256(
            abi.encode(
                _order.collection,
                _order.price,
                _order.orderExpiry));
    }
}