// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract TestPudgyPenguins is ERC721Enumerable, Ownable {
    uint256 private currentId = 0;
    uint256 private maxItems = 8888;
    string private baseTokenURI;

    constructor() ERC721("PudgyPenguins", "PPG") {
        baseTokenURI = "https://ipfs.io/ipfs/QmWXJXRdExse2YHRY21Wvh4pjRxNRQcWVhcKw4DLVnqGqs/";
    }

    function mint() public returns(uint256 mintedId) {
        require(currentId < maxItems, "Already minted out everything");

        _safeMint(_msgSender(), currentId);
        mintedId = currentId;
        currentId++;
    }

    function _baseURI() internal view virtual override returns (string memory) {
        return baseTokenURI;
    }

    function setBaseURI(string calldata _baseTokenURI) external onlyOwner {
        baseTokenURI = _baseTokenURI;
    }
}