pragma solidity >=0.4.25 <0.9.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "./IWasabiPoolFactory.sol";
import "./WasabiOption.sol";
import "./pools/ETHWasabiPool.sol";
import "./pools/ERC20WasabiPool.sol";
import "./lib/WasabiStructs.sol";
import "./lib/WasabiValidation.sol";

contract WasabiPoolFactory is Ownable, IWasabiPoolFactory {
    WasabiOption private options;
    ETHWasabiPool private immutable templatePool;
    ERC20WasabiPool private immutable templateERC20Pool;

    mapping (address => bool) private poolAddresses;

    constructor(WasabiOption _options, ETHWasabiPool _templatePool, ERC20WasabiPool _templateERC20Pool) public {
        options = _options;
        templatePool = _templatePool;
        templateERC20Pool = _templateERC20Pool;
    }

    function createPool(
        address _nftAddress,
        uint256[] calldata _initialTokenIds,
        WasabiStructs.PoolConfiguration calldata _poolConfiguration,
        WasabiStructs.OptionType[] calldata _types,
        address _admin
    ) external payable returns(address payable _poolAddress) {
        WasabiValidation.validate(_poolConfiguration);
        require(_types.length > 0, "Need to supply an option type");
        
        ETHWasabiPool pool = ETHWasabiPool(payable(Clones.clone(address(templatePool))));

        _poolAddress = payable(address(pool));
        emit NewPool(_poolAddress, _nftAddress, _msgSender());

        IERC721 nft = IERC721(_nftAddress);
        pool.initialize(this, nft, options, _msgSender(), _poolConfiguration, _types, _admin);
        if (msg.value > 0) {
            _poolAddress.transfer(msg.value);
        }

        poolAddresses[_poolAddress] = true;

        // Transfer initial NFTs from sender to pair
        uint256 numNFTs = _initialTokenIds.length;
        for (uint256 i; i < numNFTs; ) {
            nft.safeTransferFrom(_msgSender(), _poolAddress, _initialTokenIds[i]);

            unchecked {
                ++i;
            }
        }
    }

    function createERC20Pool(
        address _tokenAddress,
        uint256 _initialDeposit,
        address _nftAddress,
        uint256[] calldata _initialTokenIds,
        WasabiStructs.PoolConfiguration calldata _poolConfiguration,
        WasabiStructs.OptionType[] calldata _types,
        address _admin
    ) external payable returns(address payable _poolAddress) {
        WasabiValidation.validate(_poolConfiguration);
        require(_types.length > 0, "Need to supply an option type");
        
        ERC20WasabiPool pool = ERC20WasabiPool(payable(Clones.clone(address(templateERC20Pool))));

        _poolAddress = payable(address(pool));
        emit NewPool(_poolAddress, _nftAddress, _msgSender());

        IERC721 nft = IERC721(_nftAddress);
        IERC20 token = IERC20(_tokenAddress);

        pool.initialize(this, token, nft, options, _msgSender(), _poolConfiguration, _types, _admin);
        if (msg.value > 0) {
            _poolAddress.transfer(msg.value);
        }

        poolAddresses[_poolAddress] = true;

        // Transfer initial ERC20 from sender to pair
        if (_initialDeposit > 0) {
            token.transferFrom(_msgSender(), _poolAddress, _initialDeposit);
        }

        // Transfer initial NFTs from sender to pair
        uint256 numNFTs = _initialTokenIds.length;
        for (uint256 i; i < numNFTs; ) {
            nft.safeTransferFrom(_msgSender(), _poolAddress, _initialTokenIds[i]);

            unchecked {
                ++i;
            }
        }
    }

    function issueOption(address _target) external returns (uint256) {
        require(poolAddresses[msg.sender], "Only enabled pools can issue options");
        return options.newMint(_target);
    }

    function burnOption(uint256 _optionId) external {
        require(poolAddresses[msg.sender], "Only enabled pools can burn options");
        options.burn(_optionId);
    }

    function disablePool(address _poolAddress) external onlyOwner {
        poolAddresses[_poolAddress] = false;
    }

    receive() external payable {}

    fallback() external payable {
        require(false, "No fallback");
    }
}