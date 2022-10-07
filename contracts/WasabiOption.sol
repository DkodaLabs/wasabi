pragma solidity >=0.4.25 <0.9.0;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import { IERC2981, IERC165 } from "@openzeppelin/contracts/interfaces/IERC2981.sol";

contract WasabiOption is ERC721Enumerable, IERC2981, Ownable {
    address private factory;
    uint256 private _currentId = 100;
    uint public royaltyPercent;
    string private _baseURIextended;

    event Log(string, address);

    constructor() ERC721("Wasabi Option NFTs", "WASAB") public {}

    function setFactory(address _factory) external onlyOwner() {
        factory = _factory;
    }

    function newMint(address to) external returns (uint256 mintedId) {
        require(_msgSender() == factory, "Only the factory can mint tokens");

        _safeMint(to, _currentId);
        mintedId = _currentId;
        _currentId++;
    }

    function burn(uint256 _optionId) external {
        require(_msgSender() == factory, "Only the factory can burn tokens");
        _burn(_optionId);
    }

    function setBaseURI(string memory baseURI_) external onlyOwner() {
        _baseURIextended = baseURI_;
        _currentId = 1;
    }
    
    function _baseURI() internal view virtual override returns (string memory) {
        return _baseURIextended;
    }

    function withdraw() public onlyOwner {
        payable(owner()).transfer(address(this).balance);
    }

    // IERC2981
    function royaltyInfo(uint256 _tokenId, uint256 _salePrice) external view returns (address, uint256 royaltyAmount) {
        _tokenId; // silence solc warning
        royaltyAmount = (_salePrice / 100) * royaltyPercent;
        return (owner(), royaltyAmount);
    }
}