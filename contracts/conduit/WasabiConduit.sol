// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.4.25 <0.9.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../IWasabiPool.sol";
import "../WasabiOption.sol";
import "../lib/WasabiStructs.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

contract WasabiConduit is Ownable, IERC721Receiver {
    WasabiOption private option;
    uint256 private lastToken;
    uint256 public maxOptionsToBuy;

    function buyOptions(WasabiStructs.OptionRequest[] calldata _requests, bytes[] calldata _signatures) external payable returns(uint256[] memory) {
        uint256 size = _requests.length;
        require(size > 0, "Need to provide at least one request");
        require(size <= maxOptionsToBuy, "Cannot buy that many options");
        require(size == _requests.length, "Need to provide the same amount of signatures and requests");

        uint256[] memory tokenIds = new uint[](size);
        for (uint256 index = 0; index < _requests.length; index++) {
            uint256 tokenId = buyOption(_requests[index], _signatures[index]);
            tokenIds[index] = tokenId;
        }
        return tokenIds;
    }

    function buyOption(WasabiStructs.OptionRequest calldata _request, bytes calldata _signature) public payable returns(uint256) {
        IWasabiPool pool = IWasabiPool(_request.poolAddress);

        if (pool.getLiquidityAddress() != address(0)) {
            IERC20 erc20 = IERC20(pool.getLiquidityAddress());
            erc20.transferFrom(_msgSender(), address(this), _request.premium);
            erc20.approve(_request.poolAddress, _request.premium);
            pool.writeOption(_request, _signature); 
        } else {
            pool.writeOption{value: msg.value}(_request, _signature);
        }
        
        option.safeTransferFrom(address(this), _msgSender(), lastToken);
        return lastToken;
    }

    /**
     * Always returns `IERC721Receiver.onERC721Received.selector`.
     */
    function onERC721Received(
        address /* operator */,
        address /* from */,
        uint256 tokenId,
        bytes memory /* data */)
    public virtual override returns (bytes4) {
        lastToken = tokenId;
        return this.onERC721Received.selector;
    }

    function transferToken(address _nft, uint256 _tokenId, address _target) external onlyOwner {
        IERC721(_nft).safeTransferFrom(address(this), _target, _tokenId);
    }

    function setOption(WasabiOption _option) external onlyOwner {
        option = _option;
    }

    function setMaxOptionsToBuy(uint256 _maxOptionsToBuy) external onlyOwner {
        maxOptionsToBuy = _maxOptionsToBuy;
    }
}
