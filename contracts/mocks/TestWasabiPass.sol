// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";

contract TestWasabiPass is ERC1155 {
    constructor() ERC1155("wasabi.xyz") {}

    function mint(uint256 _amount) external {
        _mint(_msgSender(), 1, _amount, "");
    }
}