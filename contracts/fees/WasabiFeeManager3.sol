// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "./IWasabiFeeManager.sol";

/**
 * @dev An implementation of the IWasabiFeeManager
 */
contract WasabiFeeManager3 is IWasabiFeeManager, Ownable {
    address public receiver;
    uint96 public fraction;
    uint96 public denominator;
    uint96 public unitDiscount;
    IERC1155 public wasabiPass;
    uint256 public passId;
    uint8 public maxPassAmount = 10;
    bool public passDiscountEnabled;
    mapping(address => bool) public passDiscountTogglers;

    constructor(
        IERC1155 _wasabiPass,
        uint256 _passId,
        uint96 _fraction,
        uint96 _denominator,
        uint96 _unitDiscount,
        address[] memory _enabledPassDiscountTogglers)
    {
        receiver = owner();
        wasabiPass = _wasabiPass;
        passId = _passId;
        fraction = _fraction;
        denominator = _denominator;
        unitDiscount = _unitDiscount;
        passDiscountEnabled = true;

        for (uint i = 0; i < _enabledPassDiscountTogglers.length; i++) {
            passDiscountTogglers[_enabledPassDiscountTogglers[i]] = true;
        }
    }

    /// @inheritdoc IWasabiFeeManager
    function getFeeData(address, uint256 _amount) external view returns (address, uint256) {
        uint256 fractionToUse;
        if (passDiscountEnabled) {
            uint256 passBalance = wasabiPass.balanceOf(tx.origin, passId);
            if (passBalance > maxPassAmount) {
                passBalance = maxPassAmount;
            }
            fractionToUse = fraction - passBalance * unitDiscount;
        } else {
            fractionToUse = fraction;
        }
        uint256 feeAmount = (_amount * fractionToUse) / denominator;
        return (receiver, feeAmount);
    }

    /// @inheritdoc IWasabiFeeManager
    function getFeeDataForOption(uint256, uint256 _amount) external view returns (address, uint256) {
        uint256 fractionToUse;
        if (passDiscountEnabled) {
            uint256 passBalance = wasabiPass.balanceOf(tx.origin, passId);
            if (passBalance > maxPassAmount) {
                passBalance = maxPassAmount;
            }
            fractionToUse = fraction - passBalance * unitDiscount;
        } else {
            fractionToUse = fraction;
        }
        uint256 feeAmount = (_amount * fractionToUse) / denominator;
        return (receiver, feeAmount);
    }

    /// @inheritdoc IWasabiFeeManager
    function passDiscountIsEnabled() external view returns(bool) {
        return passDiscountEnabled;
    }

    /// @inheritdoc IWasabiFeeManager
    function togglePassDiscount(bool _enabled) external {
        require(_msgSender() == owner() || passDiscountTogglers[_msgSender()] == true, 'Sender is not enabled to toggle pass discount');
        passDiscountEnabled = _enabled;
    }

    /// @inheritdoc IWasabiFeeManager
    function editPassDiscountToggler(address _toggler, bool _enabled) external onlyOwner {
        passDiscountTogglers[_msgSender()] = _enabled;
        emit PassDiscountTogglerEdited(_toggler, _enabled);
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

    /**
     * @dev     Sets the unit discount of the fee
     * @param   _unitDiscount the unit discount
     */
    function setUnitDiscount(uint96 _unitDiscount) external onlyOwner {
        unitDiscount = _unitDiscount;
    }
}