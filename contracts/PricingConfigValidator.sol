// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.4.25 <0.9.0;

import "./lib/Signing.sol";

/**
 * @dev A Wasabi pricing Configuration signature validator.
 */
contract PricingConfigValidator {

    struct EIP712Domain {
        string name;
        string version;
        uint256 chainId;
        address verifyingContract;
    }

    struct PricingConfiguration {
        address poolAddress;
        uint256 premiumMultiplierPercent;
        uint256 blockNumber;
    }

    bytes32 constant EIP712DOMAIN_TYPEHASH = keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 constant TYPEHASH = keccak256("PricingConfiguration(address poolAddress,uint256 premiumMultiplierPercent,uint256 blockNumber)");

    /**
     * @dev Creates the hash of the EIP712 domain for this validator
     *
     * @param eip712Domain the domain to hash
     * @return the hashed domain
     */
    function hashDomain(EIP712Domain memory eip712Domain) internal pure returns (bytes32) {
        return keccak256(abi.encode(
            EIP712DOMAIN_TYPEHASH,
            keccak256(bytes(eip712Domain.name)),
            keccak256(bytes(eip712Domain.version)),
            eip712Domain.chainId,
            eip712Domain.verifyingContract
        ));
    }

    /**
     * @dev Creates the hash of the PricingConfiguration for this validator
     *
     * @param config the configuration to hash
     * @return the configuration domain
     */
    function hash(PricingConfiguration memory config) internal pure returns (bytes32) {
        return keccak256(abi.encode(
            TYPEHASH,
            config.poolAddress,
            config.premiumMultiplierPercent,
            config.blockNumber
        ));
    }

    /**
     * @dev Gets the signer of the given signature for the given pricing configuration
     *
     * @param _pricingConfig the pricing configuration to validate
     * @param _signature the signature to validate
     * @return address who signed the signature
     */
    function getSigner(PricingConfiguration memory _pricingConfig, bytes memory _signature) public view returns (address) {
        bytes32 domainSeparator = hashDomain(EIP712Domain({
            name: "PricingConfigValidator",
            version: '1',
            chainId: 5,
            verifyingContract: address(this)
        }));
        bytes32 digest = keccak256(abi.encodePacked(
            "\x19\x01",
            domainSeparator,
            hash(_pricingConfig)
        ));
        return Signing.recoverSigner(digest, _signature);
    }

    /**
     * @dev Checks the signer of the given signature for the given pricing configuration is the given signer
     *
     * @param _pricingConfig the pricing configuration to validate
     * @param _signature the signature to validate
     * @param _signer the signer to validate
     * @return true if the signature belongs to the signer, false otherwise
     */
    function verify(PricingConfiguration calldata _pricingConfig, bytes memory _signature, address _signer) external view returns (bool) {
        return getSigner(_pricingConfig, _signature) == _signer;
    }
}