pragma solidity >=0.4.25 <0.9.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { Clones } from "@openzeppelin/contracts/proxy/Clones.sol";

import {WasabiOption} from "./WasabiOption.sol";
import {WasabiPool} from "./WasabiPool.sol";

contract WasabiPoolFactory is Ownable {
    WasabiOption private options;
    WasabiPool private templatePool;

    mapping (address => bool) private poolAddresses;

    event Test(string, address);
    event NewPool(address poolAddress);

    constructor(WasabiOption _options, WasabiPool _templatePool) public {
        options = _options;
        templatePool = _templatePool;
    }

    function createPool(
        address _nftAddress,
        uint256[] memory _initialTokenIds
    ) external returns(address _poolAddress) {
        WasabiPool pool = WasabiPool(Clones.clone(address(templatePool)));

        _poolAddress = address(pool);
        emit NewPool(_poolAddress);

        IERC721 _nft = IERC721(_nftAddress);
        pool.initialize(this, _nft, options, _msgSender());

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

    function issueOption(address _target) external returns (uint256) {
        require(poolAddresses[_msgSender()], "Only enabled pools can issue options");
        return options.newMint(_target);
    }
}