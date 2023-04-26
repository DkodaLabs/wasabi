// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.19;

import { IFlashLoanSimpleReceiver } from "../../aave/IFlashLoanSimpleReceiver.sol";
import { IWETH } from "../../aave/IWETH.sol";

contract MockAavePool {
    address wethAddress;

    constructor(address _wethAddress) {
        wethAddress = _wethAddress;
    }

    function getPool() external returns (address) {
        return address(this);
    }

    function flashLoanSimple(
        address receiverAddress,
        address asset,
        uint256 amount,
        bytes calldata params,
        uint16 referralCode
    ) external {
        require(asset == wethAddress, 'Invalid WETH');

        IWETH(wethAddress).deposit{ value: 1 }();

        uint256 premium = 0;

        bool success = IFlashLoanSimpleReceiver(receiverAddress).executeOperation(asset, amount, premium, msg.sender, params);

        IWETH(wethAddress).transferFrom(receiverAddress, address(this), amount + premium);

        IWETH(wethAddress).withdraw(amount + premium);

        require(success, 'Failed');
    }

    receive() external payable {}

    fallback() external payable {
    }
}