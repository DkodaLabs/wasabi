// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "./IWasabiPoolFactoryV2.sol";
import "./IWasabiErrors.sol";
import "./WasabiOption.sol";
import "./pools/ETHWasabiPoolV2.sol";
import "./pools/ERC20WasabiPoolV2.sol";
import "./lib/WasabiStructs.sol";

/**
 * @dev A factory class designed to initialize new WasabiPools.
 */
contract WasabiPoolFactoryV2 is Ownable, IWasabiPoolFactoryV2 {
    WasabiOption private options;
    ETHWasabiPoolV2 private immutable templatePool;
    ERC20WasabiPoolV2 private immutable templateERC20Pool;

    address public conduit;
    address public feeManager;

    mapping(address => PoolState) private poolState;

    /**
     * @dev Initializes a new WasabiPoolFactory
     */
    constructor(
        WasabiOption _options,
        ETHWasabiPoolV2 _templatePool,
        ERC20WasabiPoolV2 _templateERC20Pool,
        address _feeManager,
        address _conduit
    ) {
        options = _options;
        templatePool = _templatePool;
        templateERC20Pool = _templateERC20Pool;
        feeManager = _feeManager;
        conduit = _conduit;
    }

    /**
     * @dev Creates a new ETH based pool
     */
    function createPool(
        address[] calldata _nfts,
        uint256[] calldata _initialTokenIds,
        address _admin
    ) external payable returns (address payable _poolAddress) {
        uint256 numNFTs = _initialTokenIds.length;
        require(_nfts.length == numNFTs, "Input array length mismatch");

        ETHWasabiPoolV2 pool = ETHWasabiPoolV2(
            payable(Clones.clone(address(templatePool)))
        );

        _poolAddress = payable(address(pool));
        emit NewPool(_poolAddress, _msgSender());

        pool.initialize{value: msg.value}(
            this,
            address(options),
            _msgSender(),
            _admin
        );

        poolState[_poolAddress] = PoolState.ACTIVE;

        // Transfer initial NFTs from sender to pair
        for (uint256 i; i != numNFTs; ) {
            IERC721(_nfts[i]).safeTransferFrom(
                _msgSender(),
                _poolAddress,
                _initialTokenIds[i]
            );

            unchecked {
                ++i;
            }
        }
    }

    /**
     * @dev Creates a new ERC20 based pool
     */
    function createERC20Pool(
        address _tokenAddress,
        uint256 _initialDeposit,
        address[] calldata _nfts,
        uint256[] calldata _initialTokenIds,
        address _admin
    ) external payable returns (address payable _poolAddress) {
        uint256 numNFTs = _initialTokenIds.length;
        require(_nfts.length == numNFTs, "Input array length mismatch");

        ERC20WasabiPoolV2 pool = ERC20WasabiPoolV2(
            payable(Clones.clone(address(templateERC20Pool)))
        );

        _poolAddress = payable(address(pool));
        emit NewPool(_poolAddress, _msgSender());

        IERC20 token = IERC20(_tokenAddress);

        pool.initialize{value: msg.value}(
            this,
            token,
            address(options),
            _msgSender(),
            _admin
        );

        poolState[_poolAddress] = PoolState.ACTIVE;

        // Transfer initial ERC20 from sender to pair
        if (_initialDeposit > 0) {
            if (
                !token.transferFrom(_msgSender(), _poolAddress, _initialDeposit)
            ) {
                revert IWasabiErrors.FailedToSend();
            }
        }

        // Transfer initial NFTs from sender to pair
        for (uint256 i; i != numNFTs; ) {
            IERC721(_nfts[i]).safeTransferFrom(
                _msgSender(),
                _poolAddress,
                _initialTokenIds[i]
            );

            unchecked {
                ++i;
            }
        }
    }

    /**
     * @dev sets the Wasabi Conduit address
     */
    function setConduitAddress(address _conduit) external onlyOwner {
        conduit = _conduit;
    }

    /**
     * @dev sets the IWasabiFeeManager address
     */
    function setFeeManager(address _feeManager) external onlyOwner {
        feeManager = _feeManager;
    }

    /// @inheritdoc IWasabiPoolFactoryV2
    function togglePool(
        address _poolAddress,
        PoolState _poolState
    ) external onlyOwner {
        require(
            poolState[_poolAddress] != _poolState,
            "Pool is in the same state"
        );
        poolState[_poolAddress] = _poolState;
    }

    /// @inheritdoc IWasabiPoolFactoryV2
    function isValidPool(address _poolAddress) external view returns (bool) {
        return poolState[_poolAddress] == PoolState.ACTIVE;
    }

    /// @inheritdoc IWasabiPoolFactoryV2
    function getPoolState(
        address _poolAddress
    ) external view returns (PoolState) {
        return poolState[_poolAddress];
    }

    /// @inheritdoc IWasabiPoolFactoryV2
    function getConduitAddress() external view returns (address) {
        return conduit;
    }

    /// @inheritdoc IWasabiPoolFactoryV2
    function getFeeManager() external view returns (address) {
        return feeManager;
    }

    receive() external payable {}

    fallback() external payable {
        require(false, "No fallback");
    }
}
