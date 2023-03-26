// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.4.25 <0.9.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./IWasabiPoolFactory.sol";
import "./IWasabiConduit.sol";
import "./lib/WasabiStructs.sol";
import "./lib/WasabiValidation.sol";
import "./lib/Signing.sol";
import "./IWasabiPool.sol";
/**
 * An base abstract implementation of the IWasabiPool which handles issuing and exercising options alond with state management.
 */
abstract contract AbstractWasabiPool is IERC721Receiver, Ownable, IWasabiPool, ReentrancyGuard {
    using EnumerableSet for EnumerableSet.UintSet;

    // Pool metadata
    IWasabiPoolFactory private factory;
    IERC721 private optionNFT;
    IERC721 private nft;
    address private admin;

    // Pool Configuration
    WasabiStructs.PoolConfiguration private poolConfiguration;
    mapping(WasabiStructs.OptionType => bool) private allowedTypes;

    // Pool Balance
    EnumerableSet.UintSet private tokenIds;

    // Option state
    EnumerableSet.UintSet private optionIds;
    mapping(uint256 => uint256) private tokenIdToOptionId;
    mapping(uint256 => WasabiStructs.OptionData) private options;
    mapping(uint256 => bool) idToFilledOrCancelled;

    receive() external payable virtual {}

    fallback() external payable {
        require(false, "No fallback");
    }

    /**
     * @dev Initializes this pool
     */
    function baseInitialize(
        IWasabiPoolFactory _factory,
        IERC721 _nft,
        IERC721 _optionNFT,
        address _owner,
        WasabiStructs.PoolConfiguration calldata _poolConfiguration,
        WasabiStructs.OptionType[] calldata _types,
        address _admin
    ) internal {
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

        if (_admin != address(0)) {
            admin = _admin;
            emit AdminChanged(_admin);
        }
    }

    /// @inheritdoc IWasabiPool
    function getNftAddress() external view returns(address) {
        return address(nft);
    }

    /// @inheritdoc IWasabiPool
    function getLiquidityAddress() external view virtual returns(address) {
        return address(0);
    }

    /// @inheritdoc IWasabiPool
    function setAdmin(address _admin) external onlyOwner {
        admin = _admin;
        emit AdminChanged(_admin);
    }

    /// @inheritdoc IWasabiPool
    function removeAdmin() external onlyOwner {
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
            if (!optionIds.contains(tokenId)) {
                revert NftIsInvalid();
            }
            clearOption(tokenId, 0, false);
        } else if (_msgSender() == address(nft)) {
            tokenIds.add(tokenId);
            emit ERC721Received(tokenId);
        } else {
            revert NftIsInvalid();
        }
        return this.onERC721Received.selector;
    }

    /// @inheritdoc IWasabiPool
    function writeOption(WasabiStructs.OptionRequest calldata _request, bytes calldata _signature) external payable nonReentrant {
        if (idToFilledOrCancelled[_request.id]) {
            revert OrderFilledOrCancelled();
        }
        validate(_request, _signature);

        uint256 optionId = factory.issueOption(_msgSender());
        WasabiStructs.OptionData memory optionData = WasabiStructs.OptionData(
            _request.optionType,
            _request.strikePrice,
            _request.premium,
            _request.expiry,
            _request.tokenId
        );
        options[optionId] = optionData;

        // Lock NFT / Token into a vault
        if (_request.optionType == WasabiStructs.OptionType.CALL) {
            tokenIdToOptionId[_request.tokenId] = optionId;
        }
        optionIds.add(optionId);
        idToFilledOrCancelled[_request.id] = true;

        emit OptionIssued(optionId);
    }

    /**
     * @dev Validates the given OptionRequest in order to issue an option
     */
    function validate(WasabiStructs.OptionRequest calldata _request, bytes calldata _signature) internal {
        // 1. Validate Signature
        address signer = Signing.getSigner(_request, _signature);
        if (signer == address(0) || (signer != admin && signer != owner())) {
            revert InvalidSignature();
        }

        // 2. Validate Meta
        require(_request.orderExpiry >= block.timestamp, "WasabiPool: Order has expired");
        require(_request.poolAddress == address(this), "WasabiPool: Signature doesn't belong to this pool");
        validateAndWithdrawPayment(_request.premium, "WasabiPool: Not enough premium is supplied");

        // 3. Request Validation
        require(allowedTypes[_request.optionType], "WasabiPool: Option type is not allowed");

        require(_request.strikePrice > 0, "WasabiPool: Strike price must be set");
        require(_request.strikePrice >= poolConfiguration.minStrikePrice, "WasabiPool: Strike price is too small");
        require(_request.strikePrice <= poolConfiguration.maxStrikePrice, "WasabiPool: Strike price is too large");

        require(_request.expiry > 0, "WasabiPool: Expiry must be set");
        require(_request.expiry >= poolConfiguration.minDuration + block.timestamp, "WasabiPool: Expiry is too small");
        require(_request.expiry <= poolConfiguration.maxDuration + block.timestamp, "WasabiPool: Expiry is too large");

        // 4. Type specific validation
        if (_request.optionType == WasabiStructs.OptionType.CALL) {
            if (!tokenIds.contains(_request.tokenId)) {
                revert NftIsInvalid();
            }
            // Check that the token is free
            uint256 optionId = tokenIdToOptionId[_request.tokenId];
            if (isValid(optionId)) {
                revert RequestNftIsLocked();
            }
        } else if (_request.optionType == WasabiStructs.OptionType.PUT) {
            if (availableBalance() < _request.strikePrice) {
                revert InsufficientAvailableLiquidity();
            }
        }
    }

    /// @inheritdoc IWasabiPool
    function executeOption(uint256 _optionId) external payable nonReentrant {
        validateOptionForExecution(_optionId, 0);
        clearOption(_optionId, 0, true);
        emit OptionExecuted(_optionId);
    }

    /// @inheritdoc IWasabiPool
    function executeOptionWithSell(uint256 _optionId, uint256 _tokenId) external payable nonReentrant {
        validateOptionForExecution(_optionId, _tokenId);
        clearOption(_optionId, _tokenId, true);
        emit OptionExecuted(_optionId);
    }

    /**
     * @dev Validates the option if its available for execution
     */
    function validateOptionForExecution(uint256 _optionId, uint256 _tokenId) private {
        require(optionIds.contains(_optionId), "WasabiPool: Option NFT doesn't belong to this pool");
        require(_msgSender() == optionNFT.ownerOf(_optionId), "WasabiPool: Only the token owner can execute the option");

        WasabiStructs.OptionData memory optionData = options[_optionId];
        require(optionData.expiry >= block.timestamp, "WasabiPool: Option has expired");

        if (optionData.optionType == WasabiStructs.OptionType.CALL) {
            validateAndWithdrawPayment(optionData.strikePrice, "WasabiPool: Strike price needs to be supplied to execute a CALL option");
        } else if (optionData.optionType == WasabiStructs.OptionType.PUT) {
            require(_msgSender() == nft.ownerOf(_tokenId), "WasabiPool: Need to own the token to sell in order to execute a PUT option");
        }
    }
    
    /**
     * @dev accepts the bid for LPs with _tokenId
     */
    function acceptBidWithTokenId(
        WasabiStructs.Bid calldata _bid,
        bytes calldata _signature,
        uint256 _tokenId
    ) public onlyOwner returns(uint256) {
        uint256 _optionId = factory.issueOption(_bid.buyer);

        // Lock NFT / Token into a vault
        if (_bid.optionType == WasabiStructs.OptionType.CALL) {
            if (!isAvailableTokenId(_tokenId)) {
                revert NftIsInvalid();
            }
            tokenIdToOptionId[_tokenId] = _optionId;
        } else {
            if (availableBalance() < _bid.strikePrice) {
                revert InsufficientAvailableLiquidity();
            }
            _tokenId = 0;
        }

        WasabiStructs.OptionData memory optionData = WasabiStructs.OptionData(
            _bid.optionType,
            _bid.strikePrice,
            _bid.price,
            _bid.expiry,
            _tokenId
        );
        options[_optionId] = optionData;
        optionIds.add(_optionId);

        emit OptionIssued(_optionId);
        IWasabiConduit(factory.getConduitAddress()).poolAcceptBid(_bid, _signature, _optionId);
        return _optionId;
    }

    /**
     * @dev accepts the bid for LPs without _tokenId
     */
    function acceptBid(
        WasabiStructs.Bid calldata _bid,
        bytes calldata _signature
    ) external onlyOwner returns(uint256) {
        uint256 _tokenId;
        if (_bid.optionType == WasabiStructs.OptionType.CALL) {
            uint256[] memory _tokenIds = getAllTokenIds();
            for (uint256 i; i < _tokenIds.length; i++ ) {
                if (isAvailableTokenId(_tokenIds[i])) {
                    _tokenId = _tokenIds[i];
                    break;
                }
            }
        } else {
            _tokenId = 0;
        }

        return acceptBidWithTokenId(_bid, _signature, _tokenId);
    }

    /**
     * @dev An abstract function to check available balance in this pool.
     */
    function availableBalance() view public virtual returns(uint256);

    /**
     * @dev An abstract function to send payment for any function
     */
    function payAddress(address _seller, uint256 _amount) internal virtual;

    /**
     * @dev An abstract function to validate and withdraw payment for any function
     */
    function validateAndWithdrawPayment(uint256 _premium, string memory _message) internal virtual;

    /**
     * @dev Clears the option from the existing state and optionally exercises it.
     */
    function clearOption(uint256 _optionId, uint256 _tokenId, bool _executed) internal {
        WasabiStructs.OptionData memory optionData = options[_optionId];
        if (optionData.optionType == WasabiStructs.OptionType.CALL) {
            if (_executed) {
                // Sell to executor, the validateOptionForExecution already checked if strike is paid
                nft.safeTransferFrom(address(this), _msgSender(), optionData.tokenId);
                tokenIds.remove(optionData.tokenId);
            }
            if (tokenIdToOptionId[optionData.tokenId] == _optionId) {
                delete tokenIdToOptionId[optionData.tokenId];
            }
        } else if (optionData.optionType == WasabiStructs.OptionType.PUT) {
            if (_executed) {
                // Buy from executor
                nft.safeTransferFrom(_msgSender(), address(this), _tokenId);
                payAddress(_msgSender(), optionData.strikePrice);
            }
        }
        delete options[_optionId];
        optionIds.remove(_optionId);
        factory.burnOption(_optionId);
    }

    /// @inheritdoc IWasabiPool
    function withdrawERC721(IERC721 _nft, uint256[] calldata _tokenIds) external onlyOwner {
        bool isPoolAsset = _nft == nft;

        uint256 numNFTs = _tokenIds.length;
        for (uint256 i; i < numNFTs; ) {
            if (isPoolAsset) {
                if (!tokenIds.contains(_tokenIds[i])) {
                    revert NftIsInvalid();
                }
                uint256 optionId = tokenIdToOptionId[_tokenIds[i]];
                if (isValid(optionId)) {
                    revert RequestNftIsLocked();
                }

                tokenIds.remove(_tokenIds[i]);
                delete tokenIdToOptionId[_tokenIds[i]];
            }
            _nft.safeTransferFrom(address(this), owner(), _tokenIds[i]);
            emit ERC721Withdrawn(_tokenIds[i]);
            unchecked {
                ++i;
            }
        }
    }

    /// @inheritdoc IWasabiPool
    function cancelRequest(uint256 _requestId) external {
        require(admin == _msgSender() || owner() == _msgSender(), "WasabiPool: only admin or owner cancel");
        if (idToFilledOrCancelled[_requestId]) {
            revert OrderFilledOrCancelled();
        }
        idToFilledOrCancelled[_requestId] = true;
        emit RequestCancelled(_requestId);
    }

    /// @inheritdoc IERC165
    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IWasabiPool).interfaceId
            || interfaceId == type(IERC721Receiver).interfaceId;
    }

    /// @inheritdoc IWasabiPool
    function isValid(uint256 _optionId) view public returns(bool) {
        if (!optionIds.contains(_optionId)) {
            return false;
        }
        return getOptionData(_optionId).expiry >= block.timestamp;
    }

    /// @inheritdoc IWasabiPool
    function getAllTokenIds() view public returns(uint256[] memory) {
        return tokenIds.values();
    }

    /// @inheritdoc IWasabiPool
    function enableType(WasabiStructs.OptionType _type) external onlyOwner {
        allowedTypes[_type] = true;
        emit PoolSettingsChanged();
    }

    /// @inheritdoc IWasabiPool
    function disableType(WasabiStructs.OptionType _type) external onlyOwner {
        delete allowedTypes[_type];
        emit PoolSettingsChanged();
    }

    /// @inheritdoc IWasabiPool
    function isEnabled(WasabiStructs.OptionType _type) external view returns(bool) {
        return allowedTypes[_type];
    }

    /// @inheritdoc IWasabiPool
    function getPoolConfiguration() external view returns(WasabiStructs.PoolConfiguration memory) {
        return poolConfiguration;
    }

    /// @inheritdoc IWasabiPool
    function setPoolConfiguration(WasabiStructs.PoolConfiguration calldata _poolConfiguration) external onlyOwner {
        WasabiValidation.validate(_poolConfiguration);
        poolConfiguration = _poolConfiguration;
        emit PoolSettingsChanged();
    }

    /// @inheritdoc IWasabiPool
    function getOptionData(uint256 _optionId) public view returns(WasabiStructs.OptionData memory) {
        if (!optionIds.contains(_optionId)) {
            revert NftIsInvalid();
        }
        return options[_optionId];
    }

    /// @inheritdoc IWasabiPool
    function getOptionIdForToken(uint256 _tokenId) external view returns(uint256) {
        if (!tokenIds.contains(_tokenId)) {
            revert NftIsInvalid();
        }
        return tokenIdToOptionId[_tokenId];
    }

    /// @inheritdoc IWasabiPool
    function getOptionIds() public view returns(uint256[] memory) {
        return optionIds.values();
    }

    /// @inheritdoc IWasabiPool
    function isAvailableTokenId(uint256 _tokenId) public view returns(bool) {
        if (!tokenIds.contains(_tokenId)) {
            return false;
        }
        uint256 optionId = tokenIdToOptionId[_tokenId];
        return !isValid(optionId);
    }
}