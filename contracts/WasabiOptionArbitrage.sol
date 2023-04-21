// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/IERC721Enumerable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "./WasabiOption.sol";
import "./IWasabiPool.sol";
import "./IWasabiErrors.sol";
import "./IReservoirV6_0_1.sol";
import { IPool } from "./aave/IPool.sol";
import { IWETH } from "./aave/IWETH.sol";
import { IPoolAddressesProvider } from "./aave/IPoolAddressesProvider.sol";
import { IFlashLoanSimpleReceiver } from "./aave/IFlashLoanSimpleReceiver.sol";
import "hardhat/console.sol";
contract WasabiOptionArbitrage is IERC721Receiver, Ownable, ReentrancyGuard, IFlashLoanSimpleReceiver {
    address private option;
    address private addressProvider; //0x2f39d218133AFaB8F2B819B1066c7E434Ad94E9e // for Aave
    address private marketAddress; // 0xC2c862322E9c97D6244a3506655DA95F05246Fd8
    address constant ETH_ADDRESS = address(0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE);
    address wethAddress = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;

    IPool private lendingPool;

    event Arbitrage(address account, uint256 optionId, uint256 payout);

    constructor(address _option, address _addressProvider, address _marketAddress) {
        option = _option;
        addressProvider = _addressProvider;
        marketAddress = _marketAddress;
        lendingPool = IPool(IPoolAddressesProvider(addressProvider).getPool());
    }

    function arbitrage(
        uint256 _optionId,
        uint256 _value,
        address _poolAddress,
        WasabiStructs.ExecutionInfo[] calldata _executionInfos
    ) external {

        // Transfer Option for Execute
        IERC721(option).safeTransferFrom(msg.sender, address(this), _optionId);

        address asset = IWasabiPool(_poolAddress).getLiquidityAddress();
        if (asset == address(0)) {
            asset = wethAddress;
        }
        WasabiStructs.OptionData memory optionData = IWasabiPool(_poolAddress).getOptionData(_optionId);
        uint16 referralCode = 0;
        bytes memory params = abi.encode(_optionId, _value, _poolAddress, _executionInfos);

        lendingPool.flashLoanSimple(address(this), asset, optionData.strikePrice, params, referralCode);

        uint256 wBalance = IERC20(wethAddress).balanceOf(address(this));
        if (wBalance != 0){
            IWETH(wethAddress).withdraw(wBalance);
        }
        
        uint256 balance = address(this).balance;
        if (balance !=0 ) {
            (bool sent, ) = payable(msg.sender).call{value: balance}("");
            require(sent, "Failed to send Ether");
        }
    }

    function executeOperation(
        address asset, 
        uint amount, 
        uint premium, 
        address initiator, 
        bytes memory params
    ) external override returns(bool) {
        (uint256 _optionId,
        uint256 _value,
        address _poolAddress,
        WasabiStructs.ExecutionInfo[] memory _executionInfos) = abi.decode(params, (uint256, uint256, address,
        WasabiStructs.ExecutionInfo[]));

        IWasabiPool pool = IWasabiPool(_poolAddress);
        WasabiStructs.OptionData memory optionData = pool.getOptionData(_optionId);
        address nft = IWasabiPool(_poolAddress).getNftAddress();

        // Validate Order
        IWETH(wethAddress).withdraw(amount);
        uint256 totalDebt = amount + premium;

        if (optionData.optionType == WasabiStructs.OptionType.CALL) {

            //Execute Option
            IWasabiPool(_poolAddress).executeOptionWithSell{value: _value}(_optionId, optionData.tokenId);
            IERC721(nft).safeTransferFrom(address(this), _executionInfos[0].module, optionData.tokenId);
            // Sell NFT
            IReservoirV6_0_1(marketAddress).execute(_executionInfos);

        } else {
            // Purchase NFT
            IReservoirV6_0_1(marketAddress).execute{value: _value}(_executionInfos);

            //Execute Option
            IERC721(nft).approve(_poolAddress, optionData.tokenId);
            IWasabiPool(_poolAddress).executeOptionWithSell(_optionId, optionData.tokenId);
            
            IWETH(wethAddress).deposit{value: totalDebt}();
        }
        
        IERC20(wethAddress).approve(address(lendingPool), totalDebt);

        return true;
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
    
    // Payable function to receive ETH
    receive() external payable {
    }
}