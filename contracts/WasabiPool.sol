pragma solidity >=0.4.25 <0.9.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "./WasabiPoolFactory.sol";
import "./lib/WasabiStructs.sol";
import "./lib/WasabiValidation.sol";
import "./lib/Signing.sol";
import "./IWasabiPool.sol";

contract WasabiPool is Ownable, IWasabiPool {
    using EnumerableSet for EnumerableSet.UintSet;

    // Pool metadata
    WasabiPoolFactory private factory;
    IERC721 private optionNFT;
    IERC721 private nft;
    address private admin;

    // Pool Configuration
    WasabiStructs.PoolConfiguration private poolConfiguration;
    mapping(WasabiStructs.OptionType => bool) private allowedTypes;

    // Pool Balance
    uint256 private lockedETH;
    EnumerableSet.UintSet private tokenIds;

    // Option state
    mapping(uint256 => uint256) private tokenIdToOptionId;
    mapping(uint256 => WasabiStructs.OptionData) private options;


    receive() external payable {
        emit ETHReceived(msg.value);
    }

    fallback() external payable {
        require(false, "No fallback");
    }

    function initialize(
        WasabiPoolFactory _factory,
        IERC721 _nft,
        IERC721 _optionNFT,
        address _owner,
        WasabiStructs.PoolConfiguration calldata _poolConfiguration,
        WasabiStructs.OptionType[] calldata _types
    ) external {
        require(owner() == address(0), "Already initialized");
        factory = _factory;
        _transferOwnership(_owner);

        nft = _nft;
        optionNFT = _optionNFT;
        poolConfiguration = _poolConfiguration;

        uint length = _types.length;
        for (uint256 i = 0; i < length; ) {
            allowedTypes[_types[i]] = true;
            unchecked {
                ++i;
            }
        }
    }

    function getCommodityAddress() external view returns(address) {
        return address(nft);
    }

    function setAdmin(address _admin) external onlyOwner {
        admin = _admin;
        emit AdminChanged(_admin);
    }

    function removeAdmin() external onlyOwner() {
        admin = address(0);
        emit AdminChanged(address(0));
    }

    /**
     * @dev Returns the address of the current owner.
     */
    function getAdmin() public view virtual returns (address) {
        return admin;
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
        if (_msgSender() == address(optionNFT)) {
            require(options[tokenId].strikePrice > 0, "Wasabi Pool: Option doesn't belong to this pool");
            clearOption(tokenId, 0, false);
            factory.executeOption(tokenId);
        } else if (_msgSender() == address(nft)) {
            tokenIds.add(tokenId);
        } else {
            revert InvalidToken();
        }
        return this.onERC721Received.selector;
    }

    function writeOption(WasabiStructs.OptionRequest calldata _request, bytes calldata _signature) external payable {
        validate(_request, _signature);

        uint256 optionId = factory.issueOption(_msgSender());
        uint256 expiration = block.timestamp + _request.duration;
        WasabiStructs.OptionData memory optionData = WasabiStructs.OptionData(
            _request.optionType,
            _request.strikePrice,
            _request.premium,
            expiration,
            _request.tokenId
        );
        options[optionId] = optionData;

        // Lock NFT / Token into a vault
        if (_request.optionType == WasabiStructs.OptionType.CALL) {
            tokenIdToOptionId[_request.tokenId] = optionId;
            emit OptionIssued(optionId, _request.tokenId);
        } else if (_request.optionType == WasabiStructs.OptionType.PUT) {
            lockedETH += _request.strikePrice;
            emit OptionIssued(optionId, _request.strikePrice);
        }
    }

    function validate(WasabiStructs.OptionRequest calldata _request, bytes calldata _signature) internal {
        // 1. Validate Signature
        address signer = Signing.getSigner(_request, _signature);
        require(admin == signer || owner() == signer, "WasabiPool: Signature not valid");

        // 2. Validate Meta
        require(_request.maxBlockToExecute >= block.number, "WasabiPool: Max block to execute has passed");
        require(_request.poolAddress == address(this), "WasabiPool: Signature doesn't belong to this pool");
        require(msg.value == _request.premium && _request.premium > 0, "WasabiPool: Not enough premium is supplied");

        // 3. Request Validation
        require(allowedTypes[_request.optionType], "WasabiPool: Option type is not allowed");

        require(_request.strikePrice > 0, "WasabiPool: Strike price must be set");
        require(_request.strikePrice >= poolConfiguration.minStrikePrice, "WasabiPool: Strike price is too small");
        require(_request.strikePrice <= poolConfiguration.maxStrikePrice, "WasabiPool: Strike price is too large");

        require(_request.duration > 0, "WasabiPool: Duration must be set");
        require(_request.duration >= poolConfiguration.minDuration, "WasabiPool: Duration is too small");
        require(_request.duration <= poolConfiguration.maxDuration, "WasabiPool: Duration is too large");

        // 4. Type specific validation
        if (_request.optionType == WasabiStructs.OptionType.CALL) {
            // Check that all tokens are free
            require(tokenIdToOptionId[_request.tokenId] == 0, "WasabiPool: Token is locked or is not in the pool");
        } else if (_request.optionType == WasabiStructs.OptionType.PUT) {
            require(availableBalance() >= _request.strikePrice, "WasabiPool: Not enough ETH available to lock");
        }
    }

    function executeOption(uint256 _optionId) external payable {
        validateOptionForExecution(_optionId, 0);
        clearOption(_optionId, 0, true);
        factory.executeOption(_optionId);
        emit OptionExecuted(_optionId);
    }

    function executeOptionWithSell(uint256 _optionId, uint256 _tokenId) external payable {
        validateOptionForExecution(_optionId, _tokenId);
        clearOption(_optionId, _tokenId, true);
        factory.executeOption(_optionId);
        emit OptionExecuted(_optionId);
    }

    function validateOptionForExecution(uint256 _optionId, uint256 _tokenId) internal view {
        require(_msgSender() == optionNFT.ownerOf(_optionId), "WasabiPool: Only the token owner can execute the option");

        WasabiStructs.OptionData memory optionData = options[_optionId];
        require(optionData.strikePrice > 0, "WasabiPool: Option NFT doesn't belong to this pool");
        require(optionData.expiry >= block.timestamp, "WasabiPool: Option has expired");

        if (optionData.optionType == WasabiStructs.OptionType.CALL) {
            require(optionData.strikePrice == msg.value, "WasabiPool: Strike price needs to be supplied to execute a CALL option");
        } else if (optionData.optionType == WasabiStructs.OptionType.PUT) {
            require(_msgSender() == nft.ownerOf(_tokenId), "WasabiPool: Need to own the token to sell in order to execute a PUT option");
        }
    }

    function clearOption(uint256 _optionId, uint256 _tokenId, bool _executed) internal {
        WasabiStructs.OptionData memory optionData = options[_optionId];
        if (optionData.optionType == WasabiStructs.OptionType.CALL) {
            if (_executed) {
                tokenIds.remove(optionData.tokenId);
                nft.safeTransferFrom(address(this), _msgSender(), optionData.tokenId);
            }
            delete tokenIdToOptionId[optionData.tokenId];
        } else if (optionData.optionType == WasabiStructs.OptionType.PUT) {
            if (_executed) {
                nft.safeTransferFrom(_msgSender(), address(this), _tokenId);
                payable(_msgSender()).transfer(optionData.strikePrice);
            }
            lockedETH -= optionData.strikePrice;
        }
        delete options[_optionId];
    }

    function withdrawERC721(IERC721 _nft, uint256[] calldata _tokenIds) external payable onlyOwner {
        bool isPoolAsset = _nft == nft;

        uint256 numNFTs = _tokenIds.length;
        for (uint256 i; i < numNFTs; ) {
            if (isPoolAsset) {
                require(tokenIdToOptionId[_tokenIds[i]] == 0 && tokenIds.contains(_tokenIds[i]), "WasabiPool: Token is locked or is not in the pool");
                tokenIds.remove(_tokenIds[i]);
                delete tokenIdToOptionId[_tokenIds[i]];
            }
            _nft.safeTransferFrom(address(this), owner(), _tokenIds[i]);
            unchecked {
                ++i;
            }
        }
    }

    function withdrawETH() external payable onlyOwner {
        require(availableBalance() > 0, "WasabiPool: No ETH available to withdraw");
        address payable to = payable(_msgSender());
        to.transfer(availableBalance());
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IWasabiPool).interfaceId
            || interfaceId == type(IERC721Receiver).interfaceId;
    }

    function availableBalance() view public returns(uint256) {
        return address(this).balance - lockedETH;
    }

    function getAllTokenIds() view public returns(uint256[] memory) {
        return tokenIds.values();
    }

    function enableType(WasabiStructs.OptionType _type) external onlyOwner {
        allowedTypes[_type] = true;
    }

    function disableType(WasabiStructs.OptionType _type) external onlyOwner {
        delete allowedTypes[_type];
    }

    function getPoolConfiguration() external view returns(WasabiStructs.PoolConfiguration memory) {
        return poolConfiguration;
    }

    function setPoolConfiguration(WasabiStructs.PoolConfiguration calldata _poolConfiguration) external onlyOwner {
        WasabiValidation.validate(_poolConfiguration);
        poolConfiguration = _poolConfiguration;
    }

    function getOptionData(uint256 _optionId) external view returns(WasabiStructs.OptionData memory) {
        require(options[_optionId].strikePrice > 0, "WasabiPool: Option doesn't belong to this pool");
        return options[_optionId];
    }
}
