// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.4.25 <0.9.0;

import "../IWasabiPoolFactory.sol";
import "../fees/IWasabiFeeManager.sol";
import "../AbstractWasabiPool.sol";

/**
 * An ETH backed implementation of the IWasabiPool.
 */
contract ETHWasabiPool is AbstractWasabiPool {
    receive() external payable override {
        emit ETHReceived(msg.value);
    }

    /**
     * @dev Initializes this pool with the given parameters.
     */
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

    /// @inheritdoc AbstractWasabiPool
    function validateAndWithdrawPayment(uint256 _premium, string memory _message) internal override {        
        IWasabiFeeManager feeManager = IWasabiFeeManager(factory.getFeeManager());
        (address feeReceiver, uint256 feeAmount) = feeManager.getFeeData(address(this), _premium);

        require(msg.value >= (_premium + feeAmount) && _premium > 0, _message);

        if (feeAmount > 0) {
            payable(feeReceiver).transfer(feeAmount);
        }
    }

    /// @inheritdoc AbstractWasabiPool
    function payAddress(address _seller, uint256 _amount) internal override {
        IWasabiFeeManager feeManager = IWasabiFeeManager(factory.getFeeManager());
        (address feeReceiver, uint256 feeAmount) = feeManager.getFeeData(address(this), _amount);

        payable(_seller).transfer(_amount - feeAmount);
        if (feeAmount > 0) {
            payable(feeReceiver).transfer(feeAmount);
        }
    }

    /// @inheritdoc IWasabiPool
    function withdrawETH(uint256 _amount) external payable onlyOwner {
        require(_amount > 0, "WasabiPool: Need to withdraw more than 0");
        if (availableBalance() < _amount) {
            revert InsufficientAvailableLiquidity();
        }
        address payable to = payable(_msgSender());
        to.transfer(_amount);

        emit ETHWithdrawn(_amount);
    }

    /// @inheritdoc IWasabiPool
    function withdrawERC20(IERC20 _token, uint256 _amount) external onlyOwner {
        require(_amount > 0, "WasabiPool: Need to withdraw more than 0");
        _token.transfer(msg.sender, _amount);
    }

    /// @inheritdoc IWasabiPool
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