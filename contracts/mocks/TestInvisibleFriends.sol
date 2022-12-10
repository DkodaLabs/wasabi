// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract TestInvisibleFriends is ERC721Enumerable, Ownable {
    uint256 private currentId = 1;
    uint256 private maxItems = 5000;
    string private baseTokenURI;

    constructor() ERC721("Invisible Friends", "INVSBLE") {
        baseTokenURI = "ipfs://QmR3eP7rku6t3azLS6T4WeBYmbTAv4zVwuEhFjxE8xpC5z/";
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