// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity 0.8.19;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract TestNakamigos is ERC721Enumerable, Ownable {
    uint256 private currentId = 0;
    uint256 private maxItems = 20000;
    string private baseTokenURI;

    constructor() ERC721("Nakamigos", "NKMGS") {
        baseTokenURI = "ipfs://QmaN1jRPtmzeqhp6s3mR1SRK4q1xWPvFvwqW1jyN6trir9/";
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
}