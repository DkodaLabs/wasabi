// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../lending/interfaces/INFTLending.sol";
import {IWETH} from "../IWETH.sol";

interface ILending {
    struct Loan {
        address nft;
        uint256 nftId;
        address currency;
        uint256 loanAmount;
        uint256 repayment;
        uint256 expiration;
    }

    function loans(uint256 loanId) external view returns (Loan memory);

    function borrow(
        bytes calldata _inputData
    ) external returns (uint256 loanId);

    function repay(uint256 _loanId) external;
}

contract MockNFTLending is INFTLending {
    using SafeERC20 for IERC20;

    address public immutable lending;

    constructor(address _lending) {
        lending = _lending;
    }

    /// @inheritdoc INFTLending
    function getLoanDetails(
        uint256 _loanId
    ) external view returns (LoanDetails memory loanDetails) {
        ILending.Loan memory loan = ILending(lending).loans(_loanId);

        return LoanDetails(
            loan.loanAmount, // borrowAmount
            loan.repayment, // repayAmount
            loan.expiration, // loanExpiration
            loan.nft, // nftAddress
            loan.nftId // tokenId
        );
    }

    function borrow(
        bytes calldata _inputData
    ) external payable returns (uint256 loanId) {
        (address nft, , , ) = abi.decode(
            _inputData,
            (address, uint256, uint256, uint256)
        );

        IERC721(nft).setApprovalForAll(lending, true);

        loanId = ILending(lending).borrow(_inputData);

        ILending.Loan memory loan = ILending(lending).loans(loanId);
        IWETH(loan.currency).withdraw(loan.loanAmount);
    }

    function repay(uint256 _loanId, address _receiver) external payable {
        ILending.Loan memory loan = ILending(lending).loans(_loanId);
        IWETH(loan.currency).deposit{value: loan.repayment}();
        IERC20 weth = IERC20(loan.currency);
        weth.safeApprove(lending, 0);
        weth.safeApprove(lending, loan.repayment);

        ILending(lending).repay(_loanId);

        if (_receiver != address(this)) {
            IERC721(loan.nft).safeTransferFrom(
                address(this),
                _receiver,
                loan.nftId
            );
        }
    }

    receive() external payable {}
}
