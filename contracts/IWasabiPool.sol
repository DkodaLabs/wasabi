pragma solidity >=0.4.25 <0.9.0;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {WasabiStructs} from "./lib/WasabiStructs.sol";

/**
 * @dev Required interface of an WasabiPool compliant contract.
 */
interface IWasabiPool is IERC165, IERC721Receiver {
    /**
     * @dev Emitted when `admin` is changed.
     */
    event AdminChanged(address admin);

    /**
     * @dev Emitted when ETH is received
     */
    event Received(address from, uint amount);

    /**
     * @dev Emitted when an option is issued an a token is locked.
     */
    event OptionIssued(uint256 optionId, uint256 lockedTokenId);

    /**
     * @dev Emitted when an option is executed.
     */
    event OptionExecuted(uint256 optionId);

    /**
     * @dev Writes an option for the given rule and buyer
     */
    function writeOption(WasabiStructs.OptionRule calldata _rule, bytes calldata _signature) external payable;

    /**
     * @dev Executes the option for the given id.
     */
    function executeOption(uint256 _optionId) external payable;

    /**
     * @dev Withdraws ERC721 tokens from the pool.
     */
    function withdrawERC721(IERC721 a, uint256[] calldata nftIds) external payable;

    /**
     * @dev Withdraws all eth from this pool
     */
    function withdrawETH() external payable;

    /**
     * @dev Sets the admin of this pool.
     */
    function setAdmin(address _admin) external;

    /**
     * @dev Removes the admin from this pool.
     */
    function removeAdmin() external;
}