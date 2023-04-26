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

        uint256 balanceBefore = address(this).balance;

        IWETH(wethAddress).deposit{ value: amount }();

        uint256 premium = amount * 10 / 1000; // 0.1%

        bool success = IFlashLoanSimpleReceiver(receiverAddress).executeOperation(asset, amount, premium, msg.sender, params);
        require(success, 'Operation Failed');

        IWETH(wethAddress).transferFrom(receiverAddress, address(this), amount + premium);

        IWETH(wethAddress).withdraw(amount + premium);

        uint256 balanceAfter = address(this).balance;
        require(balanceAfter == balanceBefore + premium, 'Not enough premium received');
    }

    receive() external payable {}

    fallback() external payable {
    }
}