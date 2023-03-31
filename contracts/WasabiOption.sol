// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.4.25 <0.9.0;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/interfaces/IERC2981.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";

import "./IWasabiPoolFactory.sol";
import "./fees/IWasabiFeeManager.sol";

/**
 * @dev An ERC721 which tracks Wasabi Option positions of accounts
 */
contract WasabiOption is ERC721Enumerable, IERC2981, Ownable {
    
    address private lastFactory;
    mapping(address => bool) private factoryAddresses;
    uint256 private _currentId = 100;
    string private _baseURIextended;

    /**
     * @dev Constructs WasabiOption
     */
    constructor() ERC721("Wasabi Option NFTs", "WASAB") {}

    /**
     * @dev Toggles the owning factory
     */
    function toggleFactory(address _factory, bool _enabled) external onlyOwner {
        factoryAddresses[_factory] = _enabled;
        if (_enabled) lastFactory = _factory;
    }

    /**
     * @dev Mints a new WasabiOption
     */
    function newMint(address to) external returns (uint256 mintedId) {
        require(factoryAddresses[msg.sender], "Only the factory can mint tokens");

        _safeMint(to, _currentId);
        mintedId = _currentId;
        _currentId++;
    }

    /**
     * @dev Burns the specified option
     */
    function burn(uint256 _optionId) external {
        require(factoryAddresses[msg.sender], "Only the factory can burn tokens");
        _burn(_optionId);
    }

    /**
     * @dev Sets the base URI
     */
    function setBaseURI(string memory baseURI_) external onlyOwner {
        _baseURIextended = baseURI_;
    }
    
    /// @inheritdoc ERC721
    function _baseURI() internal view virtual override returns (string memory) {
        return _baseURIextended;
    }

    /// @inheritdoc IERC2981
    function royaltyInfo(uint256 _tokenId, uint256 _salePrice) external view returns (address, uint256) {
        IWasabiPoolFactory _factory = IWasabiPoolFactory(lastFactory);
        IWasabiFeeManager feeManager = IWasabiFeeManager(_factory.getFeeManager());
        return feeManager.getFeeDataForOption(_tokenId, _salePrice);
    }
    
    /// @inheritdoc IERC165
    function supportsInterface(bytes4 interfaceId) public view override(ERC721Enumerable, IERC165) returns (bool) {
        return interfaceId == type(IERC2981).interfaceId || super.supportsInterface(interfaceId);
    }
}