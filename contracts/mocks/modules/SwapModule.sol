// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {BaseExchangeModule} from "./exchanges/BaseExchangeModule.sol";
import {BaseModule} from "./BaseModule.sol";
import {IUniswapV3Router} from "./IUniswapV3Router.sol";
import {IWETH} from "./IWETH.sol";

// Notes:
// - supports swapping ETH and ERC20 to any token via a direct path

contract SwapModule is BaseExchangeModule {
  struct TransferDetail {
    address recipient;
    uint256 amount;
    bool toETH;
  }

  struct Swap {
    IUniswapV3Router.ExactOutputSingleParams params;
    TransferDetail[] transfers;
  }

  // --- Fields ---

  IWETH public immutable WETH;
  IUniswapV3Router public immutable SWAP_ROUTER;

  // --- Constructor ---

  constructor(
    address owner,
    address router,
    address weth,
    address swapRouter
  ) BaseModule(owner) BaseExchangeModule(router) {
    WETH = IWETH(weth);
    SWAP_ROUTER = IUniswapV3Router(swapRouter);
  }

  // --- Fallback ---

  receive() external payable {}

  // --- Wrap ---

  function wrap(TransferDetail[] calldata targets) external payable nonReentrant {
    WETH.deposit{value: msg.value}();

    uint256 length = targets.length;
    for (uint256 i = 0; i < length; ) {
      _sendERC20(targets[i].recipient, targets[i].amount, WETH);

      unchecked {
        ++i;
      }
    }
  }

  // --- Unwrap ---

  function unwrap(TransferDetail[] calldata targets) external nonReentrant {
    uint256 balance = WETH.balanceOf(address(this));
    WETH.withdraw(balance);

    uint256 length = targets.length;
    for (uint256 i = 0; i < length; ) {
      _sendETH(targets[i].recipient, targets[i].amount);

      unchecked {
        ++i;
      }
    }
  }

  // --- Swaps ---

  function ethToExactOutput(
    Swap calldata swap,
    address refundTo
  ) external payable nonReentrant refundETHLeftover(refundTo) {
    if (address(swap.params.tokenIn) != address(WETH) || msg.value != swap.params.amountInMaximum) {
      revert WrongParams();
    }

    // Execute the swap
    SWAP_ROUTER.exactOutputSingle{value: msg.value}(swap.params);

    // Refund any ETH stucked in the router
    SWAP_ROUTER.refundETH();

    uint256 length = swap.transfers.length;
    for (uint256 i = 0; i < length; ) {
      TransferDetail calldata transferDetail = swap.transfers[i];
      if (transferDetail.toETH) {
        WETH.withdraw(transferDetail.amount);
        _sendETH(transferDetail.recipient, transferDetail.amount);
      } else {
        _sendERC20(transferDetail.recipient, transferDetail.amount, IERC20(swap.params.tokenOut));
      }

      unchecked {
        ++i;
      }
    }
  }

  function erc20ToExactOutput(
    Swap calldata swap,
    address refundTo
  ) external nonReentrant refundERC20Leftover(refundTo, swap.params.tokenIn) {
    // Approve the router if needed
    _approveERC20IfNeeded(swap.params.tokenIn, address(SWAP_ROUTER), swap.params.amountInMaximum);

    // Execute the swap
    SWAP_ROUTER.exactOutputSingle(swap.params);

    uint256 length = swap.transfers.length;
    for (uint256 i = 0; i < length; ) {
      TransferDetail calldata transferDetail = swap.transfers[i];
      if (transferDetail.toETH) {
        WETH.withdraw(transferDetail.amount);
        _sendETH(transferDetail.recipient, transferDetail.amount);
      } else {
        _sendERC20(transferDetail.recipient, transferDetail.amount, IERC20(swap.params.tokenOut));
      }

      unchecked {
        ++i;
      }
    }
  }
}
