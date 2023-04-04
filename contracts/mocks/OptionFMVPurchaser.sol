// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "../lib/WasabiStructs.sol";
import "../lib/Signing.sol";
import "../IWasabiPool.sol";
import "../IWasabiErrors.sol";

contract OptionFMVPurchaser is Ownable, ReentrancyGuard {
    address private demoEth;
    address private option;

    event OptionFMVPurchase(address from, uint256 optionId, uint256 price);

    constructor(address _demoEth) {
        demoEth = _demoEth;
    }

    function buyOption(
        uint256 _optionId,
        address _poolAddress,
        WasabiStructs.PoolAsk calldata _request,
        bytes calldata _signature
    ) external nonReentrant {
        // 1. Validate Signature
        address signer = Signing.getSigner(_request, _signature);
        require(signer == owner(), 'Signature not valid');

        IWasabiPool pool = IWasabiPool(_poolAddress);
        WasabiStructs.OptionData memory optionData = pool.getOptionData(_optionId);

        require(optionData.optionType == _request.optionType, 'Option type not equal');
        require(optionData.strikePrice == _request.strikePrice, 'Strike price not equal');
        require(optionData.expiry == _request.expiry, 'Expiry not equal');
        require(_request.orderExpiry >= block.timestamp, "WasabiPool: Order has expired");

        ERC20 token = ERC20(demoEth);
        require(token.balanceOf(address(this)) >= _request.premium, "Don't enough to pay the premium");

        IERC721 nft = IERC721(option);
        require(nft.ownerOf(_optionId) == msg.sender, 'Only owner can sell the option');

        nft.safeTransferFrom(msg.sender, _poolAddress, _optionId);
        if (!token.transfer(msg.sender, _request.premium)) {
            revert IWasabiErrors.FailedToSend();
        }

        emit OptionFMVPurchase(msg.sender, _optionId, _request.premium);
    }

    function setDemoEth(address _demoEth) external onlyOwner {
        demoEth = _demoEth;
    }

    function setOption(address _option) external onlyOwner {
        option = _option;
    }
}