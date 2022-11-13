pragma solidity >=0.4.25 <0.9.0;

import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import "./lib/WasabiStructs.sol";

/**
 * @dev Required interface of an WasabiPool compliant contract.
 */
interface IWasabiPool is IERC165, IERC721Receiver {

    /**
     * @dev Thrown when an invalid token is received
     */
    error InvalidToken();

    /**
     * @dev Emitted when `admin` is changed.
     */
    event AdminChanged(address admin);

    /**
     * @dev Emitted when an ERC721 is received
     */
    event ERC721Received(uint256 tokenId);

    /**
     * @dev Emitted when ETH is received
     */
    event ETHReceived(uint amount);

    /**
     * @dev Emitted when an ERC721 is received
     */
    event ERC721Withdrawn(uint256 tokenId);

    /**
     * @dev Emitted when ETH is received
     */
    event ETHWithdrawn(uint amount);

    /**
     * @dev Emitted when an option is executed.
     */
    event OptionExecuted(uint256 optionId);

    /**
     * @dev Emitted when an option is issued
     */
    event OptionIssued(uint256 optionId);

    /**
     * @dev Emitted when the pool settings are changed
     */
    event PoolSettingsChanged();

    /**
     * @dev Returns the address of the commodity
     */
    function getCommodityAddress() external view returns(address);

    /**
     * @dev Returns the option data for the given option id
     */
    function getOptionData(uint256 _optionId) external view returns(WasabiStructs.OptionData memory);

    /**
     * @dev Writes an option for the given rule and buyer
     */
    function writeOption(WasabiStructs.OptionRequest calldata _request, bytes calldata _signature) external payable;

    /**
     * @dev Executes the option for the given id.
     */
    function executeOption(uint256 _optionId) external payable;

    /**
     * @dev Executes the option for the given id.
     */
    function executeOptionWithSell(uint256 _optionId, uint256 _tokenId) external payable;

    /**
     * @dev Withdraws ERC721 tokens from the pool.
     */
    function withdrawERC721(IERC721 _nft, uint256[] calldata _tokenIds) external payable;

    /**
     * @dev Withdraws all eth from this pool
     */
    function withdrawETH(uint256 _amount) external payable;

    /**
     * @dev Sets the admin of this pool.
     */
    function setAdmin(address _admin) external;

    /**
     * @dev Removes the admin from this pool.
     */
    function removeAdmin() external;

    /**
     * @dev Returns the address of the current admin.
     */
    function getAdmin() external view returns (address);
}