// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;
import "./lib/WasabiStructs.sol";
import "./WasabiOption.sol";

/**
 * @dev Required interface of an WasabiConduit compliant contract.
 */
interface IWasabiConduit {

    /// @notice ETH Transfer Failed
    error EthTransferFailed();

    /// @notice Insufficient amount supplied for the transaction
    error InsufficientAmountSupplier();

    /**
     * @dev Buys multiple options
     */
    function buyOptions(
        WasabiStructs.PoolAsk[] calldata _requests,
        WasabiStructs.Ask[] calldata _asks,
        bytes[] calldata _signatures
    ) external payable returns (uint256[] memory);

    /**
     * @dev Buys an option
     */
    function buyOption(
        WasabiStructs.PoolAsk calldata _request,
        bytes calldata _signature
    ) external payable returns (uint256);

    /**
     * @dev Transfers a NFT to _target
     *
     * @param _nft the address of NFT
     * @param _tokenId the tokenId to transfer
     * @param _target the target to transfer the NFT
     */
    function transferToken(
        address _nft,
        uint256 _tokenId,
        address _target
    ) external;

    /**
     * @dev Sets the BNPL contract
     */
    function setBNPL(address _bnplContract) external;

    /**
     * @dev Sets Option information
     */
    function setOption(WasabiOption _option) external;

    /**
     * @dev Sets maximum number of option to buy
     */
    function setMaxOptionsToBuy(uint256 _maxOptionsToBuy) external;

    /**
     * @dev Sets pool factory address
     */
    function setPoolFactoryAddress(address _factory) external;

    /**
     * @dev Accepts the Ask and exercises the option
     * @param _taker the address taking this order
     * @param _ask the ask object being taken
     * @param _signature the signature of the ask
     */
    function acceptAskAndExercise(
        address _taker,
        WasabiStructs.Ask calldata _ask,
        bytes calldata _signature
    ) external payable returns (uint256);

    /**
     * @dev Accepts the Ask
     */
    function acceptAsk(
        WasabiStructs.Ask calldata _ask,
        bytes calldata _signature
    ) external payable returns (uint256);

    /**
     * @dev Accepts the Bid
     */
    function acceptBid(
        uint256 _optionId,
        address _poolAddress,
        WasabiStructs.Bid calldata _bid,
        bytes calldata _signature
    ) external payable;

    /**
     * @dev Pool Accepts the _bid
     */
    function poolAcceptBid(WasabiStructs.Bid calldata _bid, bytes calldata _signature, uint256 _optionId) external;

    /**
     * @dev Cancel the _ask
     */
    function cancelAsk(
        WasabiStructs.Ask calldata _ask,
        bytes calldata _signature
    ) external;

    /**
     * @dev Cancel the _bid
     */
    function cancelBid(
        WasabiStructs.Bid calldata _bid,
        bytes calldata _signature
    ) external;

    /// @dev Withdraws any stuck ETH in this contract
    function withdrawETH(uint256 _amount) external payable;

    /// @dev Withdraws any stuck ERC20 in this contract
    function withdrawERC20(IERC20 _token, uint256 _amount) external;

    /// @dev Withdraws any stuck ERC721 in this contract
    function withdrawERC721(IERC721 _token, uint256 _tokenId) external;
}
