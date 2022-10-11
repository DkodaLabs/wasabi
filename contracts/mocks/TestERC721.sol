// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity ^0.8.0;
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";

contract TestERC721 is ERC721Enumerable {
    uint256 private _currentId = 1001;

    constructor() ERC721("Test721", "T721") {}

    function mint() public returns(uint256 mintedId) {
        _safeMint(_msgSender(), _currentId);
        mintedId = _currentId;
        _currentId++;
    }
}