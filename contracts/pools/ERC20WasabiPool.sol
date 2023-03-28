// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.4.25 <0.9.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "../IWasabiPoolFactory.sol";
import "../AbstractWasabiPool.sol";
import "../fees/IWasabiFeeManager.sol";

/**
 * An ERC20 backed implementation of the IWasabiPool.
 */
contract ERC20WasabiPool is AbstractWasabiPool {
    IERC20 private token;

    /**
     * @dev Initializes this pool with the given parameters.
     */
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

    /// @inheritdoc IWasabiPool
    function getLiquidityAddress() override external view returns(address) {
        return address(token);
    }

    /// @inheritdoc AbstractWasabiPool
    function validateAndWithdrawPayment(uint256 _premium, string memory _message) internal override {
        IWasabiFeeManager feeManager = IWasabiFeeManager(factory.getFeeManager());
        (address feeReceiver, uint256 feeAmount) = feeManager.getFeeData(address(this), _premium);

        require(
            token.allowance(_msgSender(), address(this)) >= (_premium + feeAmount) && _premium > 0,
            _message);

        token.transferFrom(_msgSender(), address(this), _premium);
        if (feeAmount > 0) {
            token.transferFrom(_msgSender(), feeReceiver, feeAmount);
        }
    }

    /// @inheritdoc AbstractWasabiPool
    function payAddress(address _seller, uint256 _amount) internal override {
        IWasabiFeeManager feeManager = IWasabiFeeManager(factory.getFeeManager());
        (address feeReceiver, uint256 feeAmount) = feeManager.getFeeData(address(this), _amount);

        token.transfer(_seller, _amount - feeAmount);
        if (feeAmount > 0) {
            token.transfer(feeReceiver, feeAmount);
        }
    }
    
    /// @inheritdoc IWasabiPool
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

    /// @inheritdoc IWasabiPool
    function withdrawERC20(IERC20 _token, uint256 _amount) external onlyOwner {
        bool isPoolToken = _token == token;

        if (isPoolToken && availableBalance() < _amount) {
            revert InsufficientAvailableLiquidity();
        }

        _token.transfer(msg.sender, _amount);

        if (isPoolToken) {
            emit ERC20Withdrawn(_amount);
        }
    }
    
    /// @inheritdoc IWasabiPool
    function withdrawETH(uint256 _amount) external override payable onlyOwner {
        if (address(this).balance < _amount) {
            revert InsufficientAvailableLiquidity();
        }

        address payable to = payable(owner());
        to.transfer(_amount);
        emit ETHWithdrawn(_amount);
    }
}