pragma solidity >=0.4.25 <0.9.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract WasabiDemoToken is ERC20, Ownable {
    mapping(address => bool) private mintedAddress;
    uint256 private allowedMintSize = 100 ether;

    constructor() ERC20("WasabiDemoToken", "WASABI") {}

    function mint() external {
        require(!mintedAddress[msg.sender], "Address already minted");
        mintedAddress[msg.sender] = true;
        _mint(msg.sender, allowedMintSize);
    }

    function issue(address _account, uint256 _amount) external onlyOwner {
        mintedAddress[_account] = true;
        _mint(_account, _amount);
    }

    function burn(address _account, uint256 _amount) external onlyOwner {
        _burn(_account, _amount);
    }

    function burnAll(address _account) external onlyOwner {
        uint256 amount = balanceOf(_account);
        _burn(_account, amount);
    }
}