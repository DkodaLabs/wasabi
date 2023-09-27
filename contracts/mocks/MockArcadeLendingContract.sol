// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "../lending/arcade/LoanLibrary.sol";
import "../lending/arcade/IOriginationController.sol";
import "../lending/arcade/ILoanCore.sol";
import "../lending/arcade/IRepaymentController.sol";
import "./MockLending.sol";
import "../IWETH.sol";

contract MockArcadeLendingContract is MockLending, IOriginationController, ILoanCore {

    /// @dev The units of precision equal to the minimum interest of 1 basis point.
    uint256 public constant INTEREST_RATE_DENOMINATOR = 1e18;
    uint256 public constant BASIS_POINTS_DENOMINATOR = 1e4;

    mapping(uint256 => LoanLibrary.LoanData) private idToData;

    constructor(address _wethAddress) MockLending(_wethAddress) {}

    function initializeLoanWithItems(
        LoanLibrary.LoanTerms calldata loanTerms,
        address,
        address,
        LoanLibrary.Signature calldata,
        uint160,
        LoanLibrary.Predicate[] calldata
    ) external returns (uint256 loanId) {
        loanId = ++loanIdTracker;
        loans[loanId] = Loan({
            nft: loanTerms.collateralAddress,
            nftId: loanTerms.collateralId,
            currency: wethAddress,
            loanAmount: loanTerms.principal,
            repayment: getRepayAmount(loanTerms.principal, loanTerms.proratedInterestRate),
            expiration: block.timestamp + 30 days
        });

        IERC721(loanTerms.collateralAddress).safeTransferFrom(msg.sender, address(this), loanTerms.collateralId);
        IERC20(wethAddress).transfer(msg.sender, loanTerms.principal);

        LoanLibrary.FeeSnapshot memory feeSnapshot = LoanLibrary.FeeSnapshot(0, 0, 0);
            
        idToData[loanId] = LoanLibrary.LoanData(
            LoanLibrary.LoanState.Active,
            uint160(block.timestamp),
            loanTerms,
            feeSnapshot
        );
    }
    
    function getLoan(uint256 loanId) external view returns (LoanLibrary.LoanData memory loanData) {
        return idToData[loanId];
    }

    /**
     * @notice Calculate the repay amount due over a full term.
     *
     * @param principal                             Principal amount in the loan terms.
     * @param proratedInterestRate                  Interest rate in the loan terms, prorated over loan duration.
     *
     * @return repayAmount                          The amount to repay
     */
    function getRepayAmount(uint256 principal, uint256 proratedInterestRate) public pure returns (uint256) {
        return principal + getInterestAmount(principal, proratedInterestRate);
    }

    /**
     * @notice Calculate the interest due over a full term.
     *
     * @dev Interest and principal must be entered with 18 units of
     *      precision from the basis point unit (e.g. 1e18 == 0.01%)
     *
     * @param principal                             Principal amount in the loan terms.
     * @param proratedInterestRate                  Interest rate in the loan terms, prorated over loan duration.
     *
     * @return interest                             The amount of interest due.
     */
    function getInterestAmount(uint256 principal, uint256 proratedInterestRate) public pure returns (uint256) {
        return principal * proratedInterestRate / (INTEREST_RATE_DENOMINATOR * BASIS_POINTS_DENOMINATOR);
    }

    receive() external payable {
        IWETH(wethAddress).deposit{value: msg.value}();
    }
}