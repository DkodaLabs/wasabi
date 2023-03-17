// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.4.25 <0.9.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../IWasabiPool.sol";
import "../WasabiOption.sol";
import "./ConduitSignatureVerifier.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract WasabiConduit is
    Ownable,
    IERC721Receiver,
    ReentrancyGuard,
    ConduitSignatureVerifier
{
    event AskTaken(
        uint256 optionId,
        uint256 orderId,
        address seller,
        address taker
    );
    event BidTaken(
        uint256 optionId,
        uint256 orderId,
        address buyer,
        address taker
    );

    event BidCancelled(uint256 orderId, address buyer);
    event AskCancelled(uint256 orderId, address seller);

    WasabiOption private option;
    uint256 private lastToken;
    uint256 public maxOptionsToBuy;
    mapping(bytes => bool) idToFinalizedOrCancelled;

    // bool private useRoylaty

    function buyOptions(
        WasabiStructs.OptionRequest[] calldata _requests,
        WasabiStructs.Ask[] calldata _asks,
        bytes[] calldata _signatures
    ) external payable returns (uint256[] memory) {
        uint256 size = _requests.length + _asks.length;
        require(size > 0, "Need to provide at least one request");
        require(size <= maxOptionsToBuy, "Cannot buy that many options");
        require(
            size == _signatures.length,
            "Need to provide the same amount of signatures and requests"
        );

        uint256[] memory tokenIds = new uint[](size);
        for (uint256 index = 0; index < _requests.length; index++) {
            uint256 tokenId = buyOption(_requests[index], _signatures[index]);
            tokenIds[index] = tokenId;
        }
        for (uint256 index = 0; index < _asks.length; index++) {
            uint256 tokenId = acceptAsk(
                _asks[index],
                _signatures[index + _requests.length]
            );
            tokenIds[index] = tokenId;
        }
        return tokenIds;
    }

    function buyOption(
        WasabiStructs.OptionRequest calldata _request,
        bytes calldata _signature
    ) public payable returns (uint256) {
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
        bytes memory /* data */
    ) public virtual override returns (bytes4) {
        lastToken = tokenId;
        return this.onERC721Received.selector;
    }

    function transferToken(
        address _nft,
        uint256 _tokenId,
        address _target
    ) external onlyOwner {
        IERC721(_nft).safeTransferFrom(address(this), _target, _tokenId);
    }

    function setOption(WasabiOption _option) external onlyOwner {
        option = _option;
    }

    function setMaxOptionsToBuy(uint256 _maxOptionsToBuy) external onlyOwner {
        maxOptionsToBuy = _maxOptionsToBuy;
    }

    function acceptAsk(
        WasabiStructs.Ask calldata _ask,
        bytes calldata _signature
    ) public payable nonReentrant returns (uint256) {
        bytes memory id = getAskId(_ask);
        require(
            !idToFinalizedOrCancelled[id],
            "Order was finalized or cancelled"
        );

        validateAsk(_ask, _signature);

        uint256 price = _ask.price;

        (address royaltyAddress, uint256 royaltyAmount) = option.royaltyInfo(
            _ask.optionId,
            price
        );

        if (_ask.tokenAddress == address(0)) {
            require(msg.value >= price, "Not enough ETH supplied");
            if (royaltyAmount > 0) {
                payable(royaltyAddress).transfer(royaltyAmount);
                price -= royaltyAmount;
            }
            payable(_ask.seller).transfer(price);
        } else {
            IERC20 erc20 = IERC20(_ask.tokenAddress);
            if (royaltyAmount > 0) {
                erc20.transferFrom(_msgSender(), royaltyAddress, royaltyAmount);
                price -= royaltyAmount;
            }
            erc20.transferFrom(_msgSender(), _ask.seller, price);
        }
        option.safeTransferFrom(_ask.seller, _msgSender(), _ask.optionId);
        idToFinalizedOrCancelled[id] = true;

        emit AskTaken(_ask.optionId, _ask.id, _ask.seller, _msgSender());
        return _ask.optionId;
    }

    function acceptBid(
        uint256 _optionId,
        address _poolAddress,
        WasabiStructs.Bid calldata _bid,
        bytes calldata _signature
    ) external payable nonReentrant {
        bytes memory id = getBidId(_bid);
        require(
            !idToFinalizedOrCancelled[id],
            "Order was finalized or cancelled"
        );

        validateBid(_optionId, _poolAddress, _bid, _signature);

        uint256 price = _bid.price;

        (address royaltyAddress, uint256 royaltyAmount) = option.royaltyInfo(
            _optionId,
            price
        );

        IERC20 erc20 = IERC20(_bid.tokenAddress);
        if (royaltyAmount > 0) {
            erc20.transferFrom(_bid.buyer, royaltyAddress, royaltyAmount);
            price -= royaltyAmount;
        }
        erc20.transferFrom(_bid.buyer, _msgSender(), price);
        option.safeTransferFrom(_msgSender(), _bid.buyer, _optionId);
        idToFinalizedOrCancelled[id] = true;

        emit BidTaken(_optionId, _bid.id, _bid.buyer, _msgSender());
    }

    function validateAsk(
        WasabiStructs.Ask calldata _ask,
        bytes calldata _signature
    ) internal view {
        // Validate Signature
        address currentOwner = option.ownerOf(_ask.optionId);

        require(
            verifyAsk(_ask, _signature, owner()) || verifyAsk(_ask, _signature, currentOwner),
            "Incorrect signature"
        );
        require(currentOwner == _ask.seller, "Seller is not owner");

        require(_ask.orderExpiry >= block.timestamp, "Order expired");
        require(_ask.price > 0, "Price needs to be greater than 0");
    }

    function validateBid(
        uint256 _optionId,
        address _poolAddress,
        WasabiStructs.Bid calldata _bid,
        bytes calldata _signature
    ) internal view {
        require(
            option.ownerOf(_optionId) == _msgSender(),
            "Seller is not owner"
        );

        // Validate Signature
        require(
            verifyBid(_bid, _signature, owner()) ||
                verifyBid(_bid, _signature, _bid.buyer),
            "Incorrect signature"
        );
        require(
            _bid.tokenAddress != address(0),
            "Bidder didn't provide a ERC20 token"
        );

        require(_bid.orderExpiry >= block.timestamp, "Order expired");
        require(_bid.price > 0, "Price needs to be greater than 0");

        IWasabiPool pool = IWasabiPool(_poolAddress);
        require(
            pool.getCommodityAddress() == _bid.collection,
            "Collections don't match"
        );

        WasabiStructs.OptionData memory optionData = pool.getOptionData(
            _optionId
        );

        require(
            optionData.optionType == _bid.optionType,
            "Option types don't match"
        );
        require(
            optionData.strikePrice == _bid.strikePrice,
            "Strike prices don't match"
        );

        uint256 diff = optionData.expiry > _bid.expiry
            ? optionData.expiry - _bid.expiry
            : _bid.expiry - optionData.expiry;
        require(diff <= _bid.expiryAllowance, "Not within expiry range");
    }

    function cancelAsk(
        WasabiStructs.Ask calldata _ask,
        bytes calldata _signature
    ) external {
        // Validate Signature
        require(verifyAsk(_ask, _signature, _ask.seller), "Incorrect signature");

        bytes memory id = getAskId(_ask);
        require(
            !idToFinalizedOrCancelled[id],
            "Order was already finalized or cancelled"
        );

        idToFinalizedOrCancelled[id] = true;

        emit AskCancelled(_ask.id, _ask.seller);
    }

    function cancelBid(
        WasabiStructs.Bid calldata _bid,
        bytes calldata _signature
    ) external {
        // Validate Signature
        require(verifyBid(_bid, _signature, _bid.buyer), "Incorrect signature");

        bytes memory id = getBidId(_bid);
        require(
            !idToFinalizedOrCancelled[id],
            "Order was already finalized or cancelled"
        );

        idToFinalizedOrCancelled[id] = true;
        emit BidCancelled(_bid.id, _bid.buyer);
    }

    function getAskId(
        WasabiStructs.Ask calldata _ask
    ) internal pure returns (bytes memory) {
        return abi.encodePacked(_ask.seller, _ask.id);
    }

    function getBidId(
        WasabiStructs.Bid calldata _bid
    ) internal pure returns (bytes memory) {
        return abi.encodePacked(_bid.buyer, _bid.id);
    }
}