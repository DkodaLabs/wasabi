// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./IWasabiPoolFactory.sol";
import "./IWasabiConduitV2.sol";
import "./IWasabiPoolV2.sol";
import "./WasabiOption.sol";
import "./IWasabiErrors.sol";
import "./lib/PoolAskVerifierV2.sol";
import "./lib/PoolBidVerifierV2.sol";

/**
 * An base abstract implementation of the IWasabiPoolV2 which handles issuing and exercising options alond with state management.
 */
abstract contract AbstractWasabiPoolV2 is
    IERC721Receiver,
    Ownable,
    IWasabiPoolV2,
    ReentrancyGuard
{
    using EnumerableSet for EnumerableSet.UintSet;

    // Pool metadata
    IWasabiPoolFactory public factory;
    WasabiOption private optionNFT;
    address private admin;

    // Option state
    EnumerableSet.UintSet private optionIds;
    mapping(address => mapping(uint256 => uint256)) private nftToOptionId;
    mapping(uint256 => WasabiStructsV2.OptionData) private options;
    mapping(uint256 => bool) public idToFilledOrCancelled;

    receive() external payable virtual {}

    fallback() external payable {
        require(false, "No fallback");
    }

    /**
     * @dev Initializes this pool
     */
    function baseInitialize(
        IWasabiPoolFactory _factory,
        address _optionNFT,
        address _owner,
        address _admin
    ) internal {
        require(owner() == address(0), "Already initialized");
        factory = _factory;
        _transferOwnership(_owner);

        optionNFT = WasabiOption(_optionNFT);

        if (_admin != address(0)) {
            admin = _admin;
            emit AdminChanged(_admin);
        }
    }

    /// @inheritdoc IWasabiPoolV2
    function getLiquidityAddress() public view virtual returns (address) {
        return address(0);
    }

    /// @inheritdoc IWasabiPoolV2
    function setAdmin(address _admin) external onlyOwner {
        admin = _admin;
        emit AdminChanged(_admin);
    }

    /// @inheritdoc IWasabiPoolV2
    function removeAdmin() external onlyOwner {
        admin = address(0);
        emit AdminChanged(address(0));
    }

    /// @inheritdoc IWasabiPoolV2
    function getAdmin() public view virtual returns (address) {
        return admin;
    }

    /// @inheritdoc IWasabiPoolV2
    function getFactory() external view returns (address) {
        return address(factory);
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
        if (_msgSender() == address(optionNFT)) {
            if (!optionIds.contains(tokenId)) {
                revert IWasabiErrors.NftIsInvalid();
            }
            clearOption(tokenId, address(0), 0, false);
        }
        return this.onERC721Received.selector;
    }

    /// @inheritdoc IWasabiPoolV2
    function writeOptionTo(
        WasabiStructsV2.PoolAsk calldata _request,
        bytes calldata _signature,
        address _receiver
    ) public payable nonReentrant returns (uint256) {
        if (idToFilledOrCancelled[_request.id]) {
            revert IWasabiErrors.OrderFilledOrCancelled();
        }
        validate(_request, _signature);

        uint256 optionId = optionNFT.mint(_receiver, address(factory));
        WasabiStructsV2.OptionData memory optionData = WasabiStructsV2
            .OptionData(
                true,
                _request.optionType,
                _request.nft,
                _request.strikePrice,
                _request.expiry,
                _request.tokenId
            );
        options[optionId] = optionData;

        // Lock NFT / Token into a vault
        if (_request.optionType == WasabiStructsV2.OptionType.CALL) {
            nftToOptionId[_request.nft][_request.tokenId] = optionId;
        }
        optionIds.add(optionId);
        idToFilledOrCancelled[_request.id] = true;

        emit OptionIssued(optionId, _request.premium, _request.id);
        return optionId;
    }

    /// @inheritdoc IWasabiPoolV2
    function writeOption(
        WasabiStructsV2.PoolAsk calldata _request,
        bytes calldata _signature
    ) external payable returns (uint256) {
        return writeOptionTo(_request, _signature, _msgSender());
    }

    /**
     * @dev Validates the given PoolAsk in order to issue an option
     */
    function validate(
        WasabiStructsV2.PoolAsk calldata _request,
        bytes calldata _signature
    ) internal {
        // 1. Validate Signature
        address signer = PoolAskVerifierV2.getSignerForPoolAsk(
            _request,
            _signature
        );
        if (signer == address(0) || (signer != admin && signer != owner())) {
            revert IWasabiErrors.InvalidSignature();
        }

        // 2. Validate Meta
        if (_request.orderExpiry < block.timestamp) {
            revert IWasabiErrors.HasExpired();
        }

        require(
            _request.poolAddress == address(this),
            "WasabiPool: Signature doesn't belong to this pool"
        );
        validateAndWithdrawPayment(
            _request.premium,
            "WasabiPool: Not enough premium is supplied"
        );

        // 3. Request Validation
        if (_request.strikePrice == 0) {
            revert IWasabiErrors.InvalidStrike();
        }
        if (_request.expiry == 0) {
            revert IWasabiErrors.InvalidExpiry();
        }

        // 4. Type specific validation
        if (_request.optionType == WasabiStructsV2.OptionType.CALL) {
            if (
                IERC721(_request.nft).ownerOf(_request.tokenId) != address(this)
            ) {
                revert IWasabiErrors.NftIsInvalid();
            }
            // Check that the token is free
            uint256 optionId = nftToOptionId[_request.nft][_request.tokenId];
            if (isValid(optionId)) {
                revert IWasabiErrors.RequestNftIsLocked();
            }
        } else if (_request.optionType == WasabiStructsV2.OptionType.PUT) {
            if (availableBalance() < _request.strikePrice) {
                revert IWasabiErrors.InsufficientAvailableLiquidity();
            }
        }
    }

    /// @inheritdoc IWasabiPoolV2
    function executeOption(uint256 _optionId) external payable nonReentrant {
        validateOptionForExecution(_optionId, address(0), 0);
        clearOption(_optionId, address(0), 0, true);
        emit OptionExecuted(_optionId);
    }

    /// @inheritdoc IWasabiPoolV2
    function executeOptionWithSell(
        uint256 _optionId,
        address _nft,
        uint256 _tokenId
    ) external payable nonReentrant {
        validateOptionForExecution(_optionId, _nft, _tokenId);
        clearOption(_optionId, _nft, _tokenId, true);
        emit OptionExecuted(_optionId);
    }

    /**
     * @dev Validates the option if its available for execution
     */
    function validateOptionForExecution(
        uint256 _optionId,
        address _nft,
        uint256 _tokenId
    ) private {
        require(
            optionIds.contains(_optionId),
            "WasabiPool: Option NFT doesn't belong to this pool"
        );
        require(
            _msgSender() == optionNFT.ownerOf(_optionId),
            "WasabiPool: Only the token owner can execute the option"
        );

        WasabiStructsV2.OptionData memory optionData = options[_optionId];
        if (optionData.expiry < block.timestamp) {
            revert IWasabiErrors.HasExpired();
        }

        if (optionData.optionType == WasabiStructsV2.OptionType.CALL) {
            validateAndWithdrawPayment(
                optionData.strikePrice,
                "WasabiPool: Strike price needs to be supplied to execute a CALL option"
            );
        } else if (optionData.optionType == WasabiStructsV2.OptionType.PUT) {
            require(
                _msgSender() == IERC721(_nft).ownerOf(_tokenId),
                "WasabiPool: Need to own the token to sell in order to execute a PUT option"
            );
        }
    }

    /// @inheritdoc IWasabiPoolV2
    function acceptBid(
        WasabiStructsV2.Bid calldata _bid,
        bytes calldata _signature,
        address _nft,
        uint256 _tokenId
    ) public onlyOwner returns (uint256) {
        // Other validations are done in WasabiConduit
        if (_bid.optionType == WasabiStructsV2.OptionType.CALL) {
            if (!isAvailableTokenId(_nft, _tokenId)) {
                revert IWasabiErrors.NftIsInvalid();
            }
        } else {
            if (availableBalance() < _bid.strikePrice) {
                revert IWasabiErrors.InsufficientAvailableLiquidity();
            }
            _tokenId = 0;
        }

        // Lock NFT / Token into a vault
        uint256 _optionId = optionNFT.mint(_bid.buyer, address(factory));
        if (_bid.optionType == WasabiStructsV2.OptionType.CALL) {
            nftToOptionId[_nft][_tokenId] = _optionId;
        }

        WasabiStructsV2.OptionData memory optionData = WasabiStructsV2
            .OptionData(
                true,
                _bid.optionType,
                _nft,
                _bid.strikePrice,
                _bid.expiry,
                _tokenId
            );
        options[_optionId] = optionData;
        optionIds.add(_optionId);

        emit OptionIssued(_optionId, _bid.price);
        IWasabiConduitV2(factory.getConduitAddress()).poolAcceptBid(
            _bid,
            _signature,
            _optionId
        );
        return _optionId;
    }

    /// @inheritdoc IWasabiPoolV2
    function acceptAsk(
        WasabiStructsV2.Ask calldata _ask,
        bytes calldata _signature
    ) external onlyOwner {
        if (
            _ask.tokenAddress == getLiquidityAddress() &&
            availableBalance() < _ask.price
        ) {
            revert IWasabiErrors.InsufficientAvailableLiquidity();
        }

        if (_ask.tokenAddress == address(0)) {
            IWasabiConduitV2(factory.getConduitAddress()).acceptAsk{
                value: _ask.price
            }(_ask, _signature);
        } else {
            IERC20 erc20 = IERC20(_ask.tokenAddress);
            erc20.approve(factory.getConduitAddress(), _ask.price);
            IWasabiConduitV2(factory.getConduitAddress()).acceptAsk(
                _ask,
                _signature
            );
        }
    }

    /// @inheritdoc IWasabiPoolV2
    function acceptPoolBid(
        WasabiStructsV2.PoolBid calldata _poolBid,
        bytes calldata _signature
    ) external payable nonReentrant {
        // 1. Validate
        address signer = PoolBidVerifierV2.getSignerForPoolBid(
            _poolBid,
            _signature
        );
        if (signer != owner()) {
            revert IWasabiErrors.InvalidSignature();
        }
        if (!isValid(_poolBid.optionId)) {
            revert IWasabiErrors.HasExpired();
        }
        if (idToFilledOrCancelled[_poolBid.id]) {
            revert IWasabiErrors.OrderFilledOrCancelled();
        }
        if (_poolBid.orderExpiry < block.timestamp) {
            revert IWasabiErrors.HasExpired();
        }

        // 2. Only owner of option can accept bid
        if (_msgSender() != optionNFT.ownerOf(_poolBid.optionId)) {
            revert IWasabiErrors.Unauthorized();
        }

        if (_poolBid.tokenAddress == getLiquidityAddress()) {
            WasabiStructsV2.OptionData memory optionData = getOptionData(
                _poolBid.optionId
            );
            if (
                optionData.optionType == WasabiStructsV2.OptionType.CALL &&
                availableBalance() < _poolBid.price
            ) {
                revert IWasabiErrors.InsufficientAvailableLiquidity();
            } else if (
                optionData.optionType == WasabiStructsV2.OptionType.PUT &&
                // The strike price of the option can be used to payout the bid price
                (availableBalance() + optionData.strikePrice) < _poolBid.price
            ) {
                revert IWasabiErrors.InsufficientAvailableLiquidity();
            }
            clearOption(_poolBid.optionId, address(0), 0, false);
            payAddress(_msgSender(), _poolBid.price);
        } else {
            IWasabiFeeManager feeManager = IWasabiFeeManager(
                factory.getFeeManager()
            );
            (address feeReceiver, uint256 feeAmount) = feeManager.getFeeData(
                address(this),
                _poolBid.price
            );
            uint256 maxFee = _maxFee(_poolBid.price);
            if (feeAmount > maxFee) {
                feeAmount = maxFee;
            }

            if (_poolBid.tokenAddress == address(0)) {
                if (address(this).balance < _poolBid.price) {
                    revert IWasabiErrors.InsufficientAvailableLiquidity();
                }
                (bool sent, ) = payable(_msgSender()).call{
                    value: _poolBid.price - feeAmount
                }("");
                if (!sent) {
                    revert IWasabiErrors.FailedToSend();
                }
                if (feeAmount > 0) {
                    (bool _sent, ) = payable(feeReceiver).call{
                        value: feeAmount
                    }("");
                    if (!_sent) {
                        revert IWasabiErrors.FailedToSend();
                    }
                }
            } else {
                IERC20 erc20 = IERC20(_poolBid.tokenAddress);
                if (erc20.balanceOf(address(this)) < _poolBid.price) {
                    revert IWasabiErrors.InsufficientAvailableLiquidity();
                }
                if (!erc20.transfer(_msgSender(), _poolBid.price - feeAmount)) {
                    revert IWasabiErrors.FailedToSend();
                }
                if (feeAmount > 0) {
                    if (!erc20.transfer(feeReceiver, feeAmount)) {
                        revert IWasabiErrors.FailedToSend();
                    }
                }
            }
            clearOption(_poolBid.optionId, address(0), 0, false);
        }
        idToFilledOrCancelled[_poolBid.id] = true;
        emit PoolBidTaken(_poolBid.id);
    }

    /**
     * @dev An abstract function to check available balance in this pool.
     */
    function availableBalance() public view virtual returns (uint256);

    /**
     * @dev An abstract function to send payment for any function
     */
    function payAddress(address _seller, uint256 _amount) internal virtual;

    /**
     * @dev An abstract function to validate and withdraw payment for any function
     */
    function validateAndWithdrawPayment(
        uint256 _premium,
        string memory _message
    ) internal virtual;

    /// @inheritdoc IWasabiPoolV2
    function clearExpiredOptions(uint256[] memory _optionIds) public {
        if (_optionIds.length > 0) {
            for (uint256 i = 0; i < _optionIds.length; i++) {
                uint256 _optionId = _optionIds[i];
                if (!isValid(_optionId)) {
                    optionIds.remove(_optionId);
                }
            }
        } else {
            for (uint256 i = 0; i < optionIds.length(); ) {
                uint256 _optionId = optionIds.at(i);
                if (!isValid(_optionId)) {
                    optionIds.remove(_optionId);
                } else {
                    i++;
                }
            }
        }
    }

    /**
     * @dev Clears the option from the existing state and optionally exercises it.
     */
    function clearOption(
        uint256 _optionId,
        address _nft,
        uint256 _tokenId,
        bool _exercised
    ) internal {
        WasabiStructsV2.OptionData memory optionData = options[_optionId];
        if (optionData.optionType == WasabiStructsV2.OptionType.CALL) {
            if (_exercised) {
                // Sell to executor, the validateOptionForExecution already checked if strike is paid
                IERC721(_nft).safeTransferFrom(
                    address(this),
                    _msgSender(),
                    optionData.tokenId
                );
            }
            if (
                nftToOptionId[optionData.nft][optionData.tokenId] == _optionId
            ) {
                delete nftToOptionId[optionData.nft][optionData.tokenId];
            }
        } else if (optionData.optionType == WasabiStructsV2.OptionType.PUT) {
            if (_exercised) {
                // Buy from executor
                IERC721(_nft).safeTransferFrom(
                    _msgSender(),
                    address(this),
                    _tokenId
                );
                payAddress(_msgSender(), optionData.strikePrice);
            }
        }
        options[_optionId].active = false;
        optionIds.remove(_optionId);
        optionNFT.burn(_optionId);
    }

    /// @inheritdoc IWasabiPoolV2
    function withdrawERC721(
        address _nft,
        uint256[] calldata _tokenIds
    ) external onlyOwner nonReentrant {
        uint256 numNFTs = _tokenIds.length;
        for (uint256 i; i < numNFTs; ) {
            if (IERC721(_nft).ownerOf(_tokenIds[i]) != address(this)) {
                revert IWasabiErrors.NftIsInvalid();
            }
            uint256 optionId = nftToOptionId[_nft][_tokenIds[i]];
            if (isValid(optionId)) {
                revert IWasabiErrors.RequestNftIsLocked();
            }

            delete nftToOptionId[_nft][_tokenIds[i]];

            IERC721(_nft).safeTransferFrom(
                address(this),
                owner(),
                _tokenIds[i]
            );
            unchecked {
                ++i;
            }
        }
    }

    /// @inheritdoc IWasabiPoolV2
    function depositERC721(
        IERC721 _nft,
        uint256[] calldata _tokenIds
    ) external onlyOwner nonReentrant {
        uint256 numNFTs = _tokenIds.length;
        for (uint256 i; i < numNFTs; ) {
            _nft.safeTransferFrom(_msgSender(), address(this), _tokenIds[i]);
            unchecked {
                ++i;
            }
        }
    }

    /// @inheritdoc IWasabiPoolV2
    function cancelOrder(uint256 _orderId) external {
        if (_msgSender() != admin && _msgSender() != owner()) {
            revert IWasabiErrors.Unauthorized();
        }
        if (idToFilledOrCancelled[_orderId]) {
            revert IWasabiErrors.OrderFilledOrCancelled();
        }
        idToFilledOrCancelled[_orderId] = true;
        emit OrderCancelled(_orderId);
    }

    /// @inheritdoc IERC165
    function supportsInterface(
        bytes4 interfaceId
    ) external pure returns (bool) {
        return
            interfaceId == type(IWasabiPoolV2).interfaceId ||
            interfaceId == type(IERC721Receiver).interfaceId;
    }

    /// @inheritdoc IWasabiPoolV2
    function isValid(uint256 _optionId) public view returns (bool) {
        return
            options[_optionId].active &&
            options[_optionId].expiry >= block.timestamp;
    }

    /// @inheritdoc IWasabiPoolV2
    function getOptionData(
        uint256 _optionId
    ) public view returns (WasabiStructsV2.OptionData memory) {
        return options[_optionId];
    }

    /// @inheritdoc IWasabiPoolV2
    function getOptionIdForToken(
        address _nft,
        uint256 _tokenId
    ) external view returns (uint256) {
        if (IERC721(_nft).ownerOf(_tokenId) != address(this)) {
            revert IWasabiErrors.NftIsInvalid();
        }
        return nftToOptionId[_nft][_tokenId];
    }

    /// @inheritdoc IWasabiPoolV2
    function getOptionIds() public view returns (uint256[] memory) {
        return optionIds.values();
    }

    /// @inheritdoc IWasabiPoolV2
    function isAvailableTokenId(
        address _nft,
        uint256 _tokenId
    ) public view returns (bool) {
        if (IERC721(_nft).ownerOf(_tokenId) != address(this)) {
            return false;
        }
        uint256 optionId = nftToOptionId[_nft][_tokenId];
        return !isValid(optionId);
    }

    /**
     * @dev returns the maximum fee that the protocol can take for the given amount
     */
    function _maxFee(uint256 _amount) internal pure returns (uint256) {
        return _amount / 10;
    }
}
