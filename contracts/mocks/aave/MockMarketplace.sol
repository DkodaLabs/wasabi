// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.19;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

import { IWETH } from "../../IWETH.sol";

contract MockMarketplace is IERC721Receiver {
    mapping(address => mapping(uint256 => uint256)) tokenPrices;
    
    address private wethAddress;

    constructor(address _wethAddress) {
        wethAddress = _wethAddress;
    }

    function setPrice(address _nft, uint256 _token, uint256 _price) external {
        tokenPrices[_nft][_token] = _price;
    }

    function buy(address _nft, uint256 _token) external payable {
        uint256 price = tokenPrices[_nft][_token];
        IERC721 nft = IERC721(_nft);

        require(price > 0, 'No price set');
        require(nft.ownerOf(_token) == address(this), 'NFT not for sale');
        require(msg.value == price, 'Invalid price');

        nft.safeTransferFrom(address(this), msg.sender, _token);
    }

    function sell(address _nft, uint256 _token) external {
        uint256 price = tokenPrices[_nft][_token];
        IERC721 nft = IERC721(_nft);
        IWETH weth = IWETH(wethAddress);

        require(price > 0, 'No price set');
        require(nft.ownerOf(_token) == address(msg.sender), 'NFT not owned by seller');
        require(weth.balanceOf(address(this)) >= price, 'Invalid price');

        weth.transferFrom(address(this), msg.sender, price);
        nft.safeTransferFrom(msg.sender, address(this), _token);
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