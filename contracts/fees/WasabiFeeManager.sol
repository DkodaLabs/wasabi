// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.4.25 <0.9.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./IWasabiFeeManager.sol";

/**
 * @dev An implementation of the IWasabiFeeManager 
 */
contract WasabiFeeManager is IWasabiFeeManager, Ownable {
    address public receiver;
    uint96 public fraction;
    uint96 public denominator;

    constructor() {
        receiver = owner();
        fraction = 0;
        denominator = 1000;
    }

    /// @inheritdoc IWasabiFeeManager
    function getFeeData(address, uint256 _amount) external view returns (address, uint256) {
        uint256 amount = (_amount * fraction) / denominator;
        return (receiver, amount);
    }

    /// @inheritdoc IWasabiFeeManager
    function getFeeDataForOption(uint256, uint256 _amount) external view returns (address, uint256) {
        uint256 amount = (_amount * fraction) / denominator;
        return (receiver, amount);
    }

    /**
     * @dev     Sets the receiver of the fee
     * @param   _receiver  the receiver
     */
    function setReceiver(address _receiver) external onlyOwner {
        receiver = _receiver;
    }

    /**
     * @dev     Sets the fraction of the fee
     * @param   _fraction  the fraction
     */
    function setFraction(uint96 _fraction) external onlyOwner {
        fraction = _fraction;
    }

    /**
     * @dev     Sets the denominator of the fee
     * @param   _denominator the denominator
     */
    function setDenominator(uint96 _denominator) external onlyOwner {
        denominator = _denominator;
    }
}