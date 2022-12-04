pragma solidity >=0.4.25 <0.9.0;

import "../AbstractWasabiPool.sol";

contract ETHWasabiPool is AbstractWasabiPool {
    receive() external payable override {
        emit ETHReceived(msg.value);
    }

    function initialize(
        IWasabiPoolFactory _factory,
        IERC721 _nft,
        IERC721 _optionNFT,
        address _owner,
        WasabiStructs.PoolConfiguration calldata _poolConfiguration,
        WasabiStructs.OptionType[] calldata _types,
        address _admin
    ) external {
        baseInitialize(_factory, _nft, _optionNFT, _owner, _poolConfiguration, _types, _admin);
    }

    function validateAndWithdrawPayment(uint256 _premium, string memory _message) internal override {
        require(msg.value == _premium && _premium > 0, _message);
    }

    function payAddress(address _seller, uint256 _amount) internal override {
        payable(_seller).transfer(_amount);
    }

    function withdrawETH(uint256 amount) external payable onlyOwner {
        require(amount > 0, "WasabiPool: Need to withdraw more than 0");
        require(availableBalance() >= amount, "WasabiPool: Not enough ETH available to withdraw");
        address payable to = payable(_msgSender());
        to.transfer(amount);

        emit ETHWithdrawn(amount);
    }

    function withdrawERC20(IERC20 _token, uint256 _amount) external onlyOwner {
        require(_amount > 0, "WasabiPool: Need to withdraw more than 0");
        _token.transfer(msg.sender, _amount);
    }

    function availableBalance() view public override returns(uint256) {
        uint256 balance = address(this).balance;
        uint256[] memory optionIds = getOptionIds();
        for (uint256 i = 0; i < optionIds.length; i++) {
            WasabiStructs.OptionData memory optionData = getOptionData(optionIds[i]);
            if (optionData.optionType == WasabiStructs.OptionType.PUT && isValid(optionIds[i])) {
                balance -= optionData.strikePrice;
            }
        }
        return balance;
    }
}
