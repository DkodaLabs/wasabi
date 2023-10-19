// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @dev Required interface of an Wasabi Fee Manager compliant contract.
 */
interface IWasabiFeeManager {

    event PassDiscountTogglerEdited(address toggler, bool enabled);

    /**
     * @dev Returns the fee data for the given pool and amount
     * @param _pool the pool address
     * @param _amount the amount being paid
     * @return receiver the receiver of the fee
     * @return amount the fee amount
     */
    function getFeeData(address _pool, uint256 _amount) external view returns (address receiver, uint256 amount);

    /**
     * @dev Returns the fee data for the given option and amount
     * @param _optionId the option id
     * @param _amount the amount being paid
     * @return receiver the receiver of the fee
     * @return amount the fee amount
     */
    function getFeeDataForOption(uint256 _optionId, uint256 _amount) external view returns (address receiver, uint256 amount);

    /**
     * @dev returns if the pass discount is enabled or not
     */
    function passDiscountIsEnabled() external view returns(bool);

    /**
     * @dev Toggles the pass discount
     * @param _enabled flag to enable/disable the pass discount
     */
    function togglePassDiscount(bool _enabled) external;

    /**
     * Adds a new address that can toggle the pass discount.
     *
     * @param _toggler the toggler address
     * @param _enabled flag to add/remove the toggler
     */
    function editPassDiscountToggler(address _toggler, bool _enabled) external;
}