// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

interface ITellerV2 {
    struct Payment {
        uint256 principal;
        uint256 interest;
    }

    function approveMarketForwarder(uint256 _marketId, address _forwarder)
        external;

    function bidDefaultDuration(uint256) external view returns (uint32);

    function bidExpirationTime(uint256) external view returns (uint32);

    function bidId() external view returns (uint256);

    function bidPaymentCycleType(uint256) external view returns (uint8);

    function bids(uint256)
        external
        view
        returns (
            address borrower,
            address receiver,
            address lender,
            uint256 marketplaceId,
            bytes32 _metadataURI,
            LoanDetails memory loanDetails,
            Terms memory terms,
            uint8 state,
            uint8 paymentType
        );

    function borrowerBids(address, uint256) external view returns (uint256);

    function calculateAmountDue(uint256 _bidId, uint256 _timestamp)
        external
        view
        returns (Payment memory due);

    function calculateAmountOwed(uint256 _bidId, uint256 _timestamp)
        external
        view
        returns (Payment memory owed);

    function calculateNextDueDate(uint256 _bidId)
        external
        view
        returns (uint32 dueDate_);

    function cancelBid(uint256 _bidId) external;

    function claimLoanNFT(uint256 _bidId) external;

    function collateralManager() external view returns (address);

    function escrowVault() external view returns (address);

    function getBidState(uint256 _bidId) external view returns (uint8);

    function getBorrowerActiveLoanIds(address _borrower)
        external
        view
        returns (uint256[] memory);

    function getBorrowerLoanIds(address _borrower)
        external
        view
        returns (uint256[] memory);

    function getLoanBorrower(uint256 _bidId)
        external
        view
        returns (address borrower_);

    function getLoanLender(uint256 _bidId)
        external
        view
        returns (address lender_);

    function getLoanLendingToken(uint256 _bidId)
        external
        view
        returns (address token_);

    function getLoanMarketId(uint256 _bidId)
        external
        view
        returns (uint256 _marketId);

    function getLoanSummary(uint256 _bidId)
        external
        view
        returns (
            address borrower,
            address lender,
            uint256 marketId,
            address principalTokenAddress,
            uint256 principalAmount,
            uint32 acceptedTimestamp,
            uint32 lastRepaidTimestamp,
            uint8 bidState
        );

    function hasApprovedMarketForwarder(
        uint256 _marketId,
        address _forwarder,
        address _account
    ) external view returns (bool);

    function initialize(
        uint16 _protocolFee,
        address _marketRegistry,
        address _reputationManager,
        address _lenderCommitmentForwarder,
        address _collateralManager,
        address _lenderManager,
        address _escrowVault
    ) external;

    function isLoanDefaulted(uint256 _bidId) external view returns (bool);

    function isLoanExpired(uint256 _bidId) external view returns (bool);

    function isLoanLiquidateable(uint256 _bidId) external view returns (bool);

    function isPaymentLate(uint256 _bidId) external view returns (bool);

    function isTrustedForwarder(address forwarder) external view returns (bool);

    function isTrustedMarketForwarder(
        uint256 _marketId,
        address _trustedMarketForwarder
    ) external view returns (bool);

    function lastRepaidTimestamp(uint256 _bidId) external view returns (uint32);

    function lenderAcceptBid(uint256 _bidId)
        external
        returns (
            uint256 amountToProtocol,
            uint256 amountToMarketplace,
            uint256 amountToBorrower
        );

    function lenderCloseLoan(uint256 _bidId) external;

    function lenderCommitmentForwarder() external view returns (address);

    function lenderManager() external view returns (address);

    function lenderVolumeFilled(address, address)
        external
        view
        returns (uint256);

    function liquidateLoanFull(uint256 _bidId) external;

    function marketRegistry() external view returns (address);

    function protocolFee() external view returns (uint16);

    function renounceMarketForwarder(uint256 _marketId, address _forwarder)
        external;

    function renounceOwnership() external;

    function repayLoan(uint256 _bidId, uint256 _amount) external;

    function repayLoanFull(uint256 _bidId) external;

    function repayLoanFullWithoutCollateralWithdraw(uint256 _bidId) external;

    function repayLoanMinimum(uint256 _bidId) external;

    function repayLoanWithoutCollateralWithdraw(uint256 _bidId, uint256 _amount)
        external;

    function reputationManager() external view returns (address);

    function setEscrowVault(address _escrowVault) external;

    function setProtocolFee(uint16 newFee) external;

    function setTrustedMarketForwarder(uint256 _marketId, address _forwarder)
        external;
}

struct LoanDetails {
    address lendingToken;
    uint256 principal;
    Payment totalRepaid;
    uint32 timestamp;
    uint32 acceptedTimestamp;
    uint32 lastRepaidTimestamp;
    uint32 loanDuration;
}

struct Terms {
    uint256 paymentCycleAmount;
    uint32 paymentCycle;
    uint16 APR;
}

struct Collateral {
    uint8 _collateralType;
    uint256 _amount;
    uint256 _tokenId;
    address _collateralAddress;
}

// interface ITellerV2 {
//     enum BidState {
//         NONEXISTENT,
//         PENDING,
//         CANCELLED,
//         ACCEPTED,
//         PAID,
//         LIQUIDATED,
//         CLOSED
//     }

//     /**
//      * @notice Represents a total amount for a payment.
//      * @param principal Amount that counts towards the principal.
//      * @param interest  Amount that counts toward interest.
//      */
//     struct Payment {
//         uint256 principal;
//         uint256 interest;
//     }

//     function calculateNextDueDate(uint256 _bidId) external view returns (uint32 dueDate_);

//     function calculateAmountDue(uint256 _bidId, uint256 _timestamp)
//         external
//         view
//         returns (Payment memory due);

//     /**
//      * @notice Function for users to make the minimum amount due for an active loan.
//      * @param _bidId The id of the loan to make the payment towards.
//      */
//     function repayLoanMinimum(uint256 _bidId) external;

//     /**
//      * @notice Function for users to repay an active loan in full.
//      * @param _bidId The id of the loan to make the payment towards.
//      */
//     function repayLoanFull(uint256 _bidId) external;

//     /**
//      * @notice Function for users to make a payment towards an active loan.
//      * @param _bidId The id of the loan to make the payment towards.
//      * @param _amount The amount of the payment.
//      */
//     function repayLoan(uint256 _bidId, uint256 _amount) external;

//     /**
//      * @notice Checks to see if a borrower is delinquent.
//      * @param _bidId The id of the loan bid to check for.
//      */
//     function isLoanDefaulted(uint256 _bidId) external view returns (bool);

//     /**
//      * @notice Checks to see if a loan was delinquent for longer than liquidation delay.
//      * @param _bidId The id of the loan bid to check for.
//      */
//     function isLoanLiquidateable(uint256 _bidId) external view returns (bool);

//     /**
//      * @notice Checks to see if a borrower is delinquent.
//      * @param _bidId The id of the loan bid to check for.
//      */
//     function isPaymentLate(uint256 _bidId) external view returns (bool);

//     function getBidState(uint256 _bidId) external view returns (BidState);

//     function getBorrowerActiveLoanIds(address _borrower)
//         external
//         view
//         returns (uint256[] memory);

//     /**
//      * @notice Returns the borrower address for a given bid.
//      * @param _bidId The id of the bid/loan to get the borrower for.
//      * @return borrower_ The address of the borrower associated with the bid.
//      */
//     function getLoanBorrower(uint256 _bidId)
//         external
//         view
//         returns (address borrower_);

//     /**
//      * @notice Returns the lender address for a given bid.
//      * @param _bidId The id of the bid/loan to get the lender for.
//      * @return lender_ The address of the lender associated with the bid.
//      */
//     function getLoanLender(uint256 _bidId)
//         external
//         view
//         returns (address lender_);

//     function getLoanLendingToken(uint256 _bidId)
//         external
//         view
//         returns (address token_);

//     function getLoanMarketId(uint256 _bidId) external view returns (uint256);

//     function getLoanSummary(uint256 _bidId)
//         external
//         view
//         returns (
//             address borrower,
//             address lender,
//             uint256 marketId,
//             address principalTokenAddress,
//             uint256 principalAmount,
//             uint32 acceptedTimestamp,
//             uint32 lastRepaidTimestamp,
//             BidState bidState
//         );

//     function approveMarketForwarder(uint256 _marketId, address _forwarder) external;
// }