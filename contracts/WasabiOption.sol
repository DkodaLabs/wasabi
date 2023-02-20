// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.4.25 <0.9.0;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/interfaces/IERC2981.sol";

/**
 * @dev An ERC721 which tracks Wasabi Option positions of accounts
 */
contract WasabiOption is ERC721Enumerable, IERC2981, Ownable {
    address private factory;
    uint256 private _currentId = 100;
    uint public royaltyPercent;
    string private _baseURIextended;

    /**
     * @dev Constructs WasabiOption
     */
    constructor() ERC721("Wasabi Option NFTs", "WASAB") public {
        royaltyPercent = 2;
    }

    /**
     * @dev Sets the owning factory
     */
    function setFactory(address _factory) external onlyOwner {
        factory = _factory;
    }

    /**
     * @dev Mints a new WasabiOption
     */
    function newMint(address to) external returns (uint256 mintedId) {
        require(msg.sender == factory, "Only the factory can mint tokens");

        _safeMint(to, _currentId);
        mintedId = _currentId;
        _currentId++;
    }

    /**
     * @dev Burns the specified option
     */
    function burn(uint256 _optionId) external {
        require(msg.sender == factory, "Only the factory can burn tokens");
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
    function royaltyInfo(uint256 _tokenId, uint256 _salePrice) external view returns (address, uint256 royaltyAmount) {
        _tokenId; // silence solc warning
        royaltyAmount = (_salePrice / 100) * royaltyPercent;
        return (owner(), royaltyAmount);
    }

    function updateRoyalty(uint256 _royaltyPercent) external onlyOwner {
        royaltyPercent = _royaltyPercent;
    }
}