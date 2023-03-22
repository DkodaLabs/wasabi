// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.4.25 <0.9.0;

/**
 * @dev Required interface of an WasabiPoolFactory compliant contract.
 */
interface IWasabiPoolFactory {
    /**
     * @dev Emitted when there is a new pool created
     */
    event NewPool(address poolAddress, address indexed nftAddress, address indexed owner);

    /**
     * @dev Isses option to the given target
     */
    function issueOption(address _target) external returns (uint256);

    /**
     * @dev Burns the specified option
     */
    function burnOption(uint256 _optionId) external;

    /**
     * @dev Disables/enables the specified pool.
     */
    function togglePool(address _poolAddress, bool _enabled) external;

    /**
     * @dev Checks if the pool for the given address is enabled.
     */
    function isValidPool(address _poolAddress) external returns(bool);

    /**
     * @dev Returns WasabiConduit Contract Address.
     */
    function getConduitAddress() external returns(address);
}