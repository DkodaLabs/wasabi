// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/IERC721Enumerable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "./MockStructs.sol";
import "./NFTAMM.sol";
import "../lib/WasabiStructs.sol";
import "../IWasabiPool.sol";
import "../IWasabiErrors.sol";

contract MockArbitrage is IERC721Receiver, Ownable, ReentrancyGuard {
    address private demoEth;
    address private option;
    address private ammAddress;
    uint256 private feePercent;

    event Arbitrage(address account, uint256 optionId, uint256 payout);

    constructor(address _demoEth, address _amm) {
        demoEth = _demoEth;
        ammAddress = _amm;
    }

    function arbitrage(
        uint256 _optionId,
        address _poolAddress,
        MockStructs.AMMOrder calldata _order,
        bytes calldata _signature
    ) external {
        NFTAMM amm = NFTAMM(ammAddress);
        IWasabiPool pool = IWasabiPool(_poolAddress);
        IERC721Enumerable nft = IERC721Enumerable(_order.collection);
        IERC20 token = IERC20(demoEth);
        IERC721 wasabiOption = IERC721(option);
        WasabiStructs.OptionData memory optionData = pool.getOptionData(_optionId);

        // Validate Order
        require(pool.getNftAddress() == _order.collection, "Invalid collection for option");
        require(pool.getLiquidityAddress() == demoEth, "Invalid liquidity token for option");

        uint256 payout;
        if (optionData.optionType == WasabiStructs.OptionType.CALL) {
            require(token.balanceOf(address(this)) >= optionData.strikePrice, 'Not enough money in contract to buy');
            require(_order.price >= optionData.strikePrice, 'Cannot arbitrage CALL if market price is less than strike price');
            payout = _order.price - optionData.strikePrice;
        } else {
            require(token.balanceOf(address(this)) >= _order.price, 'Not enough money in contract to buy');
            require(_order.price <= optionData.strikePrice, 'Cannot arbitrage PUT if market price is more than strike price');
            payout = optionData.strikePrice - _order.price;
        }

        wasabiOption.safeTransferFrom(_msgSender(), address(this), _optionId);
        if (optionData.optionType == WasabiStructs.OptionType.CALL) {
            // 1. Buy from Wasabi Pool
            token.approve(_poolAddress, optionData.strikePrice);
            pool.executeOption(_optionId);

            // 2. Sell to AMM
            nft.approve(ammAddress, optionData.tokenId);
            amm.sell(optionData.tokenId, _order, _signature);
        } else {
            // 1. Buy from AMM
            token.approve(ammAddress, _order.price);
            uint256 tokenId = amm.buy(_order, _signature);

            // 2. Sell to Wasabi Pool
            nft.approve(_poolAddress, tokenId);
            pool.executeOptionWithSell(_optionId, tokenId);
        }

        if (payout > 0) {
            if (feePercent > 0) {
                payout = (100 - feePercent) * payout / 100;
            }
            if (!token.transfer(_msgSender(), payout)) {
                revert IWasabiErrors.FailedToSend();
            }
        }

        emit Arbitrage(_msgSender(), _optionId, payout);
    }

    function setDemoEth(address _demoEth) external onlyOwner {
        demoEth = _demoEth;
    }

    function setOption(address _option) external onlyOwner {
        option = _option;
    }

    function setAMM(address _amm) external onlyOwner {
        ammAddress = _amm;
    }

    function setFee(uint256 _feePercent) external onlyOwner {
        require(_feePercent < 100, 'Fee cannot be more than 100');
        feePercent = _feePercent;
    }

    function getFeePercent() view external returns(uint256) {
        return feePercent;
    }

    /**
     * Always returns `IERC721Receiver.onERC721Received.selector`.
     */
    function onERC721Received(
        address /* operator */,
        address /* from */,
        uint256 /* tokenId */,
        bytes memory /* data */)
    public virtual override returns (bytes4) {
        return this.onERC721Received.selector;
    }
}