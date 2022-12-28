// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.4.25 <0.9.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "../AbstractWasabiPool.sol";

contract ERC20WasabiPool is AbstractWasabiPool {
    IERC20 private token;

    function initialize(
        IWasabiPoolFactory _factory,
        IERC20 _token,
        IERC721 _nft,
        IERC721 _optionNFT,
        address _owner,
        WasabiStructs.PoolConfiguration calldata _poolConfiguration,
        WasabiStructs.OptionType[] calldata _types,
        address _admin
    ) external {
        baseInitialize(_factory, _nft, _optionNFT, _owner, _poolConfiguration, _types, _admin);
        token = _token;
    }

    function getLiquidityAddress() override external view returns(address) {
        return address(token);
    }

    function validateAndWithdrawPayment(uint256 _premium, string memory _message) internal override {
        require(token.allowance(_msgSender(), address(this)) >= _premium && _premium > 0, _message);
        token.transferFrom(_msgSender(), address(this), _premium);
    }

    function payAddress(address _seller, uint256 _amount) internal override {
        token.transfer(_seller, _amount);
    }
    
    function availableBalance() view public override returns(uint256) {
        uint256 balance = token.balanceOf(address(this));
        uint256[] memory optionIds = getOptionIds();
        for (uint256 i = 0; i < optionIds.length; i++) {
            WasabiStructs.OptionData memory optionData = getOptionData(optionIds[i]);
            if (optionData.optionType == WasabiStructs.OptionType.PUT && isValid(optionIds[i])) {
                balance -= optionData.strikePrice;
            }
        }
        return balance;
    }

    function withdrawERC20(IERC20 _token, uint256 _amount) external onlyOwner {
        require(_amount > 0, "WasabiPool: Need to withdraw more than 0");

        bool isPoolToken = _token == token;

        if (isPoolToken) {
            require(availableBalance() >= _amount, "WasabiPool: Not enough balance available to withdraw");
        }

        _token.transfer(msg.sender, _amount);

        if (isPoolToken) {
            emit ERC20Withdrawn(_amount);
        }
    }
    
    function withdrawETH(uint256 _amount) external override payable onlyOwner {
        require(_amount > 0, "WasabiPool: Need to withdraw more than 0");
        require(address(this).balance >= _amount, "WasabiPool: Not enough ETH available to withdraw");

        address payable to = payable(owner());
        to.transfer(_amount);
        emit ETHWithdrawn(_amount);
    }
}