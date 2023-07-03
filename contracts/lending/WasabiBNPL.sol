// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Address.sol";

import "../lib/Signing.sol";
import {IWETH} from "../IWETH.sol";
import "./interfaces/IWasabiBNPL.sol";
import "./interfaces/IWasabiOption.sol";
import "./interfaces/ILendingAddressProvider.sol";
import "./interfaces/INFTLending.sol";

contract WasabiBNPL is IWasabiBNPL, Ownable, IERC721Receiver, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using Address for address;

    /// @notice Wasabi Option
    IWasabiOption public wasabiOption;

    /// @notice Wasabi Address Provider
    ILendingAddressProvider public addressProvider;

    /// @notice Wasabi Pool Factory
    address public factory;

    /// @notice Flashloan premium value
    uint256 public flashloanPremiumValue;

    /// @notice Flashloan premium fraction
    uint256 public immutable flashloanPremiumFraction;

    /// @notice Option ID to LoanInfo mapping
    mapping(uint256 => LoanInfo) public optionToLoan;

    /// @notice WasabiBNPL Constructor
    /// @param _wasabiOption Wasabi Option address
    /// @param _addressProvider Wasabi Address Provider address
    /// @param _factory Wasabi Pool Factory address
    constructor(IWasabiOption _wasabiOption, ILendingAddressProvider _addressProvider, address _factory) {
        wasabiOption = _wasabiOption;
        addressProvider = _addressProvider;
        factory = _factory;
        flashloanPremiumValue = 9;
        flashloanPremiumFraction = 10_000; // 0.09%
    }

    /// @notice Executes BNPL flow
    /// @dev BNLP flow
    ///      1. take flashloan
    ///      2. buy nft from marketplace
    ///      3. get loan from nft lending protocol
    /// @param _nftLending NFTLending contract address
    /// @param _borrowData Borrow data
    /// @param _value Call value
    /// @param _marketplaceCallData List of marketplace calldata
    /// @param _signatures Signatures
    function bnpl(
        address _nftLending,
        bytes calldata _borrowData,
        uint256 _value,
        FunctionCallData[] calldata _marketplaceCallData,
        bytes[] calldata _signatures
    ) external payable nonReentrant {
        validate(_marketplaceCallData, _signatures);

        if (!addressProvider.isLending(_nftLending)) {
            revert InvalidParam();
        }

        uint256 balanceBefore = address(this).balance;
        if (balanceBefore < _value) {
            revert InsufficientBalance();
        }
        balanceBefore -= msg.value;

        // Buy NFT
        bool marketSuccess = executeFunctions(_marketplaceCallData);
        if (!marketSuccess) {
            revert FunctionCallFailed();
        }

        bytes memory result = _nftLending.functionDelegateCall(
            abi.encodeWithSelector(INFTLending.borrow.selector, _borrowData)
        );
        uint256 loanId = abi.decode(result, (uint256));

        uint256 optionId = wasabiOption.mint(_msgSender(), factory);
        optionToLoan[optionId] = LoanInfo({
            nftLending: _nftLending,
            loanId: loanId
        });

        // repay flashloan
        uint256 loanPremium = ((_value - msg.value) * flashloanPremiumValue) /
            flashloanPremiumFraction;

        if (address(this).balance < balanceBefore + loanPremium) {
            revert LoanNotPaid();
        }
        uint256 payout = address(this).balance - balanceBefore - loanPremium;

        (bool sent, ) = payable(_msgSender()).call{value: payout}("");
        if (!sent) {
            revert EthTransferFailed();
        }
    }

    /// @notice Executes a given list of functions
    /// @param _marketplaceCallData List of marketplace calldata
    function executeFunctions(
        FunctionCallData[] memory _marketplaceCallData
    ) internal returns (bool) {
        uint256 length = _marketplaceCallData.length;
        for (uint256 i; i != length; ++i) {
            FunctionCallData memory functionCallData = _marketplaceCallData[i];
            (bool success, ) = functionCallData.to.call{
                value: functionCallData.value
            }(functionCallData.data);
            if (success == false) {
                return false;
            }
        }
        return true;
    }

    /// @notice Validates if the FunctionCallData list has been approved
    /// @param _marketplaceCallData List of marketplace calldata
    /// @param _signatures Signatures
    function validate(
        FunctionCallData[] calldata _marketplaceCallData,
        bytes[] calldata _signatures
    ) internal view {
        uint256 calldataLength = _marketplaceCallData.length;
        require(calldataLength > 0, "Need marketplace calls");
        require(calldataLength == _signatures.length, "Length is invalid");
        for (uint256 i; i != calldataLength; ++i) {
            bytes32 ethSignedMessageHash = Signing.getEthSignedMessageHash(
                getMessageHash(_marketplaceCallData[i])
            );
            require(
                Signing.recoverSigner(ethSignedMessageHash, _signatures[i]) ==
                    owner(),
                "Owner is not signer"
            );
        }
    }

    /// @notice Returns the message hash for the given _data
    function getMessageHash(
        FunctionCallData calldata _data
    ) public pure returns (bytes32) {
        return keccak256(abi.encode(_data.to, _data.value, _data.data));
    }

    /// @dev Withdraws any stuck ETH in this contract
    function withdrawETH(uint256 _amount) external payable onlyOwner {
        if (_amount > address(this).balance) {
            _amount = address(this).balance;
        }
        (bool sent, ) = payable(owner()).call{value: _amount}("");
        if (!sent) {
            revert EthTransferFailed();
        }
    }

    /// @dev Withdraws any stuck ERC20 in this contract
    function withdrawERC20(IERC20 _token, uint256 _amount) external onlyOwner {
        _token.safeTransfer(_msgSender(), _amount);
    }

    /// @dev Withdraws any stuck ERC721 in this contract
    function withdrawERC721(
        IERC721 _token,
        uint256 _tokenId
    ) external onlyOwner {
        _token.safeTransferFrom(address(this), owner(), _tokenId);
    }

    /// @dev Sets the flashloan loan premium value
    function setFlashloanPremiumValue(uint256 _flashloanPremiumValue) external onlyOwner {
        flashloanPremiumValue = _flashloanPremiumValue;
    }

    function onERC721Received(
        address /* operator */,
        address /* from */,
        uint256 /* tokenId */,
        bytes memory /* data */
    ) public virtual override returns (bytes4) {
        return this.onERC721Received.selector;
    }

    receive() external payable {}
}
