// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;
import "./lib/WasabiStructsV2.sol";
import "./WasabiOption.sol";

/**
 * @dev Required interface of an WasabiConduit compliant contract.
 */
interface IWasabiConduitV2 {

    /**
     * @dev Buys multiple options
     */
    function buyOptions(
        WasabiStructsV2.PoolAsk[] calldata _requests,
        WasabiStructsV2.Ask[] calldata _asks,
        bytes[] calldata _signatures
    ) external payable returns (uint256[] memory);

    /**
     * @dev Buys an option
     */
    function buyOption(
        WasabiStructsV2.PoolAsk calldata _request,
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
     * @dev Accpets the Ask
     */
    function acceptAsk(
        WasabiStructsV2.Ask calldata _ask,
        bytes calldata _signature
    ) external payable returns (uint256);

    /**
     * @dev Accpets the Bid
     */
    function acceptBid(
        uint256 _optionId,
        address _poolAddress,
        WasabiStructsV2.Bid calldata _bid,
        bytes calldata _signature
    ) external payable;

    /**
     * @dev Pool Accepts the _bid
     */
    function poolAcceptBid(WasabiStructsV2.Bid calldata _bid, bytes calldata _signature, uint256 _optionId) external;

    /**
     * @dev Cancel the _ask
     */
    function cancelAsk(
        WasabiStructsV2.Ask calldata _ask,
        bytes calldata _signature
    ) external;

    /**
     * @dev Cancel the _bid
     */
    function cancelBid(
        WasabiStructsV2.Bid calldata _bid,
        bytes calldata _signature
    ) external;
}
