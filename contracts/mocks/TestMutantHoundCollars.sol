// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity 0.8.19;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract TestMutantHoundCollars is ERC721Enumerable, Ownable {
    uint256 private currentId = 1;
    uint256 private maxItems = 10001;
    string private baseTokenURI;

    constructor() ERC721("Mutant Hound Collars", "MHC") {
        baseTokenURI = "ipfs://bafybeigsr2hpotqmmgbdb7bkbs63rx77bqdcyjc3y2y5t7dw2ermjoaymy/";
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