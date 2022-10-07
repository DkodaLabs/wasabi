pragma solidity >=0.4.25 <0.9.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {WasabiPoolFactory} from "./WasabiPoolFactory.sol";
import {WasabiStructs} from "./lib/WasabiStructs.sol";
import {Signing} from "./lib/Signing.sol";
import {IWasabiPool} from "./IWasabiPool.sol";

contract WasabiPool is Ownable, IWasabiPool {
    WasabiPoolFactory private factory;
    IERC721 private optionNFT;
    IERC721 private nft;
    address private admin;

    uint256 private lockedETH;
    mapping(uint256 => TokenStatus) private tokenIdToStatus;
    mapping(uint256 => Vault) private vaults;

    event ERC721Received(address, uint256);
    event Test(string, uint256);

    function initialize(
        WasabiPoolFactory _factory,
        IERC721 _nft,
        IERC721 _optionNFT,
        address _owner
    ) external {
        require(owner() == address(0), "Already initialized");
        factory = _factory;
        _transferOwnership(_owner);

        nft = _nft;
        optionNFT = _optionNFT;
    }

    function setAdmin(address _admin) external onlyOwner() {
        admin = _admin;
        emit AdminChanged(_admin);
    }

    function removeAdmin() external onlyOwner() {
        admin = address(0);
        emit AdminChanged(address(0));
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
            require(vaults[tokenId].rule.strikePrice > 0, "Option NFT doesn't belong to this pool");
            clearVault(tokenId, 0, false);
        } else if (_msgSender() == address(nft)) {
            tokenIdToStatus[tokenId] = TokenStatus.FREE;
        } else {
            revert InvalidToken();
        }
        return this.onERC721Received.selector;
    }

    enum TokenStatus { NA, FREE, LOCKED }

    struct Vault {
        WasabiStructs.OptionRule rule;
    }

    error InvalidToken();

    function writeOption(WasabiStructs.OptionRule calldata _rule, bytes calldata _signature) public payable {
        validateSignature(_rule, _signature);
        validate(_rule);

        uint256 optionId = factory.issueOption(_msgSender());
        vaults[optionId] = Vault(_rule);

        // lock nft / token into a vault
        if (_rule.optionType == WasabiStructs.OptionType.CALL) {
            tokenIdToStatus[_rule.tokenId] = TokenStatus.LOCKED;
            emit OptionIssued(optionId, _rule.tokenId);
        } else if (_rule.optionType == WasabiStructs.OptionType.PUT) {
            lockedETH += _rule.strikePrice;
            emit OptionIssued(optionId, _rule.strikePrice);
        }
    }

    function validateSignature(WasabiStructs.OptionRule calldata _rule, bytes calldata _signature) internal view {
        bool isValid;
        // First check for admin if present, it's more likely that an admin signs a txn if its set
        if (admin != address(0)) {
            isValid = Signing.verify(admin, _rule, _signature);
        }
        if (!isValid) {
            isValid = Signing.verify(owner(), _rule, _signature);
        }
        require(isValid, "WasabiPool: Signature Not Valid");
    }

    function validate(WasabiStructs.OptionRule calldata _rule) internal {
        // require(_msgSender() == admin || _msgSender() == owner(), "WasabiPool: caller is not the owner or admin");
        require(msg.value == _rule.premium && _rule.premium > 0, "WasabiPool: Not enough premium is supplied");
        require(_rule.strikePrice > 0, "WasabiPool: Strike price must be set");

        // require(_rule.expiration - currentDate < poolRules.maxExpiration, "Cannot issue more than max expiration");
        // require(_rule.expiration - currentDate > poolRules.minExpiration, "Cannot issue less than min expiration");

        if (_rule.optionType == WasabiStructs.OptionType.CALL) {
            // Check that all tokens are free
            require(tokenIdToStatus[_rule.tokenId] == TokenStatus.FREE, "WasabiPool: Token is locked or is not in the pool");
        } else if (_rule.optionType == WasabiStructs.OptionType.PUT) {
            require(availableBalance() >= _rule.strikePrice, "WasabiPool: Not enough ETH available to lock");
        }
    }

    function executeOption(uint256 _optionId) external payable {
        validateOptionForExecution(_optionId, 0);
        clearVault(_optionId, 0, true);
        factory.executeOption(_optionId);
        emit OptionExecuted(_optionId);
    }

    function executeOptionWithSell(uint256 _optionId, uint256 _tokenId) external payable {
        validateOptionForExecution(_optionId, _tokenId);
        clearVault(_optionId, _tokenId, true);
        factory.executeOption(_optionId);
        emit OptionExecuted(_optionId);
    }

    // function getFactoryAddress() public view returns(address) {
    //     return factory;
    // }

    function validateOptionForExecution(uint256 _optionId, uint256 _tokenId) internal view {
        require(_msgSender() == optionNFT.ownerOf(_optionId), "WasabiPool: Only the token owner can execute the option");

        Vault memory vault = vaults[_optionId];
        require(vault.rule.strikePrice > 0, "WasabiPool: Option NFT doesn't belong to this pool");

        // TODO: check expiry

        if (vault.rule.optionType == WasabiStructs.OptionType.CALL) {
            require(vault.rule.strikePrice == msg.value, "WasabiPool: Strike price needs to be supplied to execute a CALL option");
        } else if (vault.rule.optionType == WasabiStructs.OptionType.PUT) {
            require(_msgSender() == nft.ownerOf(_tokenId), "WasabiPool: Need to own the token to sell in order to execute a PUT option");
        }
    }

    function clearVault(uint256 _optionId, uint256 _tokenId, bool _executed) internal {
        Vault memory vault = vaults[_optionId];
        if (vault.rule.optionType == WasabiStructs.OptionType.CALL) {
            if (_executed) {
                nft.safeTransferFrom(address(this), _msgSender(), vault.rule.tokenId);
            }
            tokenIdToStatus[vault.rule.tokenId] = _executed ? TokenStatus.NA : TokenStatus.FREE;
        } else if (vault.rule.optionType == WasabiStructs.OptionType.PUT) {
            if (_executed) {
                nft.safeTransferFrom(_msgSender(), address(this), _tokenId);
                payable(_msgSender()).transfer(vault.rule.strikePrice);
                lockedETH -= vault.rule.strikePrice;
            }
        }
        delete vaults[_optionId];
    }

    function withdrawERC721(IERC721 _nft, uint256[] calldata tokenIds) external payable onlyOwner {
        bool isPoolAsset = _nft == nft;

        uint256 numNFTs = tokenIds.length;
        for (uint256 i; i < numNFTs; ) {
            if (isPoolAsset) {
                require(tokenIdToStatus[tokenIds[i]] == TokenStatus.FREE, "WasabiPool: Token is locked or is not in the pool");
                tokenIdToStatus[tokenIds[i]] = TokenStatus.NA;
            }
            _nft.safeTransferFrom(address(this), owner(), tokenIds[i]);
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

    receive() external payable {
        emit Received(_msgSender(), msg.value);
    }
}
