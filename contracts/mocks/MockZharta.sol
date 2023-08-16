// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "../lending/interfaces/zharta/ILoansPeripheral.sol";
import "../lending/interfaces/zharta/ILoansCore.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

contract MockZharta is ILoansPeripheral, ILoansCore, IERC721Receiver {    
    mapping(address => ILoansCore.Loan[]) private idToLoan;

    function reserveEth(
        uint256 _amount,
        uint256 _interest,
        uint256 _maturity,
        ILoansCore.Collateral[] calldata _collaterals,
        bool _delegations,
        uint256 _deadline,
        uint256 _nonce,
        uint256 _genesisToken,
        uint256 _v,
        uint256 _r,
        uint256 _s
    ) external returns (uint256 _loanId) {
        uint256 totalAmount = 0;
        for (uint256 i = 0; i < _collaterals.length; i++) {
            IERC721(_collaterals[i].contractAddress)
                .safeTransferFrom(msg.sender, address(this), _collaterals[i].tokenId);
            totalAmount += _collaterals[i].amount;
        }

        payable(msg.sender).transfer(totalAmount);

        _loanId = idToLoan[msg.sender].length;

        Loan storage loan = idToLoan[msg.sender].push();
        loan.id = _loanId;
        loan.amount = totalAmount;
        loan.interest = _interest;
        loan.maturity = _maturity;
        loan.startTime = block.timestamp;
        loan.started = true;

        // Initialize the collateralArray with the provided collaterals
        for (uint256 i = 0; i < _collaterals.length; i++) {
            loan.collaterals.push(_collaterals[i]);
        }

        idToLoan[msg.sender].push(loan);
    }

    function pay(uint256 _loanId) external payable {
        ILoansCore.Loan storage loan = idToLoan[msg.sender][_loanId];
        require(loan.started, "Invalid loan");
        require(!loan.invalidated && !loan.canceled && !loan.paid && !loan.defaulted, "Loan not active");

        uint256 amountToPay = getLoanPayableAmount(msg.sender, _loanId, block.timestamp);

        require(msg.value == amountToPay, 'Not enough paid');
        idToLoan[msg.sender][_loanId].paid = true;

        for (uint256 i = 0; i < loan.collaterals.length; i++) {
            IERC721(loan.collaterals[i].contractAddress)
                .safeTransferFrom(address(this), msg.sender, loan.collaterals[i].tokenId);
        }
    }

    function getLoanPayableAmount(
        address _borrower,
        uint256 _loanId,
        uint256 _timestamp
    ) public view returns (uint256) {
        return idToLoan[_borrower][_loanId].amount + 1 ether;
    }

    /**
     * Always returns `IERC721Receiver.onERC721Received.selector`.
     */
    function onERC721Received(
        address /* operator */,
        address /* from */,
        uint256 /* tokenId */,
        bytes memory /* data */)
    public virtual override returns (bytes4) {
        return this.onERC721Received.selector;
    }

    function getLoan(
        address _borrower,
        uint256 _loanId
    ) external view returns (ILoansCore.Loan memory) {
        return idToLoan[_borrower][_loanId];
    }
    
    receive() external payable {}
}