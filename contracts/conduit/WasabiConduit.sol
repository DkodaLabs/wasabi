// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.4.25 <0.9.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../IWasabiPool.sol";
import "../WasabiOption.sol";
import "../lib/WasabiStructs.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

contract WasabiConduit is Ownable, IERC721Receiver {
    WasabiOption private option;
    uint256 lastToken;

    function buyOption(WasabiStructs.OptionRequest calldata _request, bytes calldata _signature) external payable returns(uint256) {
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

    // constructor() {
    //     maxNumOptions = 1;
    // }

    // uint256 private maxNumOptions;

    // struct MultiOptionRequest {
    //     WasabiStructs.OptionRequest request;
    //     bytes _signature;
    // }

    // function buyOptions(MultiOptionRequest[] calldata _requests) external payable {
    //     uint256 numRequests = _requests.length;

    //     require(numRequests > 0, "Need to provide at least one request");
    //     require(numRequests <= maxNumOptions, "Cannot buy that many options at once");

    //     for (uint256 i; i < numRequests; ) {
    //         MultiOptionRequest memory request = _requests[i];
    //         IWasabiPool pool = IWasabiPool(request.request.poolAddress);

    //         if (pool.getCommodityAddress() != address(0)) {
    //             IERC20 erc20 = IERC20(pool.getCommodityAddress());
    //             erc20.transferFrom(_msgSender(), address(this), request.request.premium);
    //             erc20.approve(request.request.poolAddress, request.request.premium);
    //         }

    //         // TODO: Use option id returned from write option once its changed
    //         pool.writeOption(request.request, request._signature);
    //         option.safeTransferFrom(address(this), _msgSender(), pool.getOptionIds()[pool.getOptionIds().length - 1]);

    //         unchecked {
    //             ++i;
    //         }
    //     }
    // }

    function setOption(WasabiOption _option) external onlyOwner {
        option = _option;
    }
}