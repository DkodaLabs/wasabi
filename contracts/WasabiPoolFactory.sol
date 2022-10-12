pragma solidity >=0.4.25 <0.9.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { Clones } from "@openzeppelin/contracts/proxy/Clones.sol";

import {WasabiOption} from "./WasabiOption.sol";
import {WasabiPool} from "./WasabiPool.sol";
import {WasabiStructs} from "./lib/WasabiStructs.sol";
import {WasabiValidation} from "./lib/WasabiValidation.sol";

contract WasabiPoolFactory is Ownable {
    WasabiOption private options;
    WasabiPool private templatePool;

    mapping (address => bool) private poolAddresses;

    event NewPool(address poolAddress, address indexed commodityAddress, address indexed owner);

    constructor(WasabiOption _options, WasabiPool _templatePool) public {
        options = _options;
        templatePool = _templatePool;
    }

    function createPool(
        address _nftAddress,
        uint256[] calldata _initialTokenIds,
        WasabiStructs.PoolConfiguration calldata _poolConfiguration,
        WasabiStructs.OptionType[] calldata _types
    ) external payable returns(address payable _poolAddress) {
        WasabiValidation.validate(_poolConfiguration);
        require(_types.length > 0, "Need to supply an option type");
        
        WasabiPool pool = WasabiPool(payable(Clones.clone(address(templatePool))));

        _poolAddress = payable(address(pool));
        emit NewPool(_poolAddress, _nftAddress, _msgSender());

        IERC721 _nft = IERC721(_nftAddress);
        pool.initialize(this, _nft, options, _msgSender(), _poolConfiguration, _types);
        if (msg.value > 0) {
            _poolAddress.transfer(msg.value);
        }

        poolAddresses[_poolAddress] = true;

        // Transfer initial NFTs from sender to pair
        uint256 numNFTs = _initialTokenIds.length;
        for (uint256 i; i < numNFTs; ) {
            _nft.safeTransferFrom(_msgSender(), _poolAddress, _initialTokenIds[i]);

            unchecked {
                ++i;
            }
        }
    }

    function executeOption(uint256 _optionId) external {
        require(poolAddresses[_msgSender()], "Only enabled pools can execute options");
        options.burn(_optionId);
    }

    function issueOption(address _target) external returns (uint256) {
        require(poolAddresses[_msgSender()], "Only enabled pools can issue options");
        return options.newMint(_target);
    }

    function disablePool(address _poolAddress) external onlyOwner {
        poolAddresses[_poolAddress] = false;
    }

    fallback() external payable {
        require(false, "No fallback");
    }
}