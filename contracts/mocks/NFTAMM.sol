// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.4.25 <0.9.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/IERC721Enumerable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "./MockStructs.sol";
import "../lib/Signing.sol";

contract NFTAMM is IERC721Receiver, Ownable, ReentrancyGuard {
    address private demoEth;

    event Sale(address from, address to, uint256 tokenId, uint256 price);

    constructor(address _demoEth) {
        demoEth = _demoEth;
    }

    function buy(MockStructs.AMMOrder calldata _order, bytes calldata _signature) external nonReentrant returns(uint tokenId) {
        validate(_order, _signature);
        IERC721Enumerable nft = IERC721Enumerable(_order.collection);
        IERC20 token = IERC20(demoEth);

        require(nft.balanceOf(address(this)) > 0, 'No tokens to sell');

        token.transferFrom(_msgSender(), address(this), _order.price);

        tokenId = nft.tokenOfOwnerByIndex(address(this), 0);
        nft.safeTransferFrom(address(this), _msgSender(), tokenId);

        emit Sale(address(this), _msgSender(), tokenId, _order.price);
    }


    function sell(uint256 _tokenId, MockStructs.AMMOrder calldata _order, bytes calldata _signature) external nonReentrant {
        validate(_order, _signature);
        IERC721Enumerable nft = IERC721Enumerable(_order.collection);
        IERC20 token = IERC20(demoEth);

        nft.safeTransferFrom(_msgSender(), address(this), _tokenId);
        token.transfer(_msgSender(), _order.price);

        emit Sale(_msgSender(), address(this), _tokenId, _order.price);
    }

    function setDemoEth(address _demoEth) external onlyOwner {
        demoEth = _demoEth;
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

    function validate(MockStructs.AMMOrder calldata _order, bytes calldata _signature) private view {
        // Validate Signature
        bytes32 ethSignedMessageHash = Signing.getEthSignedMessageHash(MockStructs.getMessageHash(_order));
        require(Signing.recoverSigner(ethSignedMessageHash, _signature) == owner(), 'Owner is not signer');

        require(_order.orderExpiry >= block.timestamp, "WasabiPool: Order has expired");
        require(_order.price > 0, "Price needs to be greater than 0");
    }
}