// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

contract TestCaptainz is ERC721Enumerable, Ownable {
    using Strings for uint256;

    uint256 private currentId = 0;
    uint256 private maxItems = 9999;
    string private baseTokenURI;
    string private suffix;

    constructor() ERC721("Captainz", "Captainz") {
        baseTokenURI = "https://api.memeland.com/captainz/metadata/";
        suffix = ".json";
    }

    function mint() external onlyOwner returns(uint256) {
        return mint(_msgSender());
    }

    function mint(address _to) public onlyOwner returns(uint256 mintedId) {
        require(currentId < maxItems, "Already minted out everything");

        _safeMint(_to, currentId);
        mintedId = currentId;
        currentId++;
    }

    function issue(address _to, uint256 _count) external onlyOwner {
        for (uint256 i; i < _count; i++) {
            mint(_to);
        }
    }

    function _baseURI() internal view virtual override returns (string memory) {
        return baseTokenURI;
    }

    function setBaseURI(string calldata _baseTokenURI) external onlyOwner {
        baseTokenURI = _baseTokenURI;
    }

    function setSuffix(string calldata _suffix) external onlyOwner {
        suffix = _suffix;
    }

    /**
     * @dev See {IERC721Metadata-tokenURI}.
     */
    function tokenURI(uint256 tokenId) public view virtual override returns (string memory) {
        _requireMinted(tokenId);

        string memory baseURI = _baseURI();
        return bytes(baseURI).length > 0
            ? string(abi.encodePacked(
                string(abi.encodePacked(baseURI, tokenId.toString())),
                suffix))
            : "";
    }
}