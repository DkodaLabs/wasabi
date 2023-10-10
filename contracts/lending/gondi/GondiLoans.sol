// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

interface GondiLoans {

    function DOMAIN_SEPARATOR() external view returns (bytes32);

    function FEE_UPDATE_NOTICE() external view returns (uint256);

    function INITIAL_DOMAIN_SEPARATOR() external view returns (bytes32);

    function MAX_PROTOCOL_FEE() external view returns (uint256);

    function addWhitelistedCallbackContract(address _contract) external;

    function approveSigner(address _signer) external;

    function cancelAllOffers(address _lender, uint256 _minOfferId) external;

    function cancelAllRenegotiationOffers(
        address _lender,
        uint256 _minRenegotiationId
    ) external;

    function cancelOffer(address _lender, uint256 _offerId) external;

    function cancelOffers(address _lender, uint256[] memory _offerIds) external;

    function cancelRenegotiationOffer(address _lender, uint256 _renegotiationId)
        external;

    function cancelRenegotiationOffers(
        address _lender,
        uint256[] memory _renegotiationIds
    ) external;

    function emitLoan(
        IBaseLoan.LoanOffer memory _loanOffer,
        uint256 _tokenId,
        bytes memory _lenderOfferSignature,
        bool _withCallback
    ) external returns (uint256, IMultiSourceLoan.Loan memory);

    function getApprovedSigner(address) external view returns (address);

    function getCollectionManager() external view returns (address);

    function getCurrencyManager() external view returns (address);

    function getImprovementMinimum()
        external
        view
        returns (IBaseLoan.ImprovementMinimum memory);

    function getLiquidationAuctionDuration() external view returns (uint48);

    function getLiquidator() external view returns (address);

    function getLoanHash(uint256 _loanId) external view returns (bytes32);

    function getMaxSources() external view returns (uint8);

    function getMinSourcePrincipal(uint256 _loanPrincipal)
        external
        view
        returns (uint256);

    function getPendingProtocolFee()
        external
        view
        returns (IBaseLoan.ProtocolFee memory);

    function getPendingProtocolFeeSetTime() external view returns (uint256);

    function getProtocolFee()
        external
        view
        returns (IBaseLoan.ProtocolFee memory);

    function getTotalLoansIssued() external view returns (uint256);

    function getUsedCapacity(address _lender, uint256 _offerId)
        external
        view
        returns (uint256);

    function isOfferCancelled(address, uint256) external view returns (bool);

    function isRenegotiationOfferCancelled(address, uint256)
        external
        view
        returns (bool);

    function isWhitelistedCallbackContract(address _contract)
        external
        view
        returns (bool);

    function lenderMinOfferId(address) external view returns (uint256);

    function lenderMinRenegotiationOfferId(address)
        external
        view
        returns (uint256);

    function liquidateLoan(uint256 _loanId, IMultiSourceLoan.Loan memory _loan)
        external;

    function loanLiquidated(
        address _collateralAddress,
        uint256 _collateralTokenId,
        uint256 _loanId,
        uint256 _repayment,
        bytes memory _loan
    ) external;

    function name() external view returns (string memory);

    function onERC721Received(
        address,
        address,
        uint256,
        bytes memory
    ) external returns (bytes4);

    function owner() external view returns (address);

    function refinanceFull(
        IMultiSourceLoan.RenegotiationOffer memory _renegotiationOffer,
        IMultiSourceLoan.Loan memory _loan,
        bytes memory _renegotiationOfferSignature
    ) external returns (uint256, IMultiSourceLoan.Loan memory);

    function refinancePartial(
        IMultiSourceLoan.RenegotiationOffer memory _renegotiationOffer,
        IMultiSourceLoan.Loan memory _loan
    ) external returns (uint256, IMultiSourceLoan.Loan memory);

    function refinancePartialBatch(
        IMultiSourceLoan.RenegotiationOffer[] memory _renegotiationOffer,
        IMultiSourceLoan.Loan[] memory _loan
    )
        external
        returns (uint256[] memory loanId, IMultiSourceLoan.Loan[] memory loans);

    function removeWhitelistedCallbackContract(address _contract) external;

    function repayLoan(
        address _collateralTo,
        uint256 _loanId,
        IMultiSourceLoan.Loan memory _loan,
        bool _withCallback
    ) external;

    function setMaxSources(uint8 maxSources) external;

    function setProtocolFee() external;

    function transferOwnership(address newOwner) external;

    function updateImprovementMinimum(
        IBaseLoan.ImprovementMinimum memory _newMinimum
    ) external;

    function updateLiquidationAuctionDuration(uint48 _newDuration) external;

    function updateLiquidationContract(address loanLiquidator) external;

    function updateProtocolFee(IBaseLoan.ProtocolFee memory _newProtocolFee)
        external;
}

interface IBaseLoan {
    struct ProtocolFee {
        address recipient;
        uint256 fraction;
    }

    struct ImprovementMinimum {
        uint256 principalAmount;
        uint256 interest;
        uint256 duration;
    }

    struct OfferValidator {
        address validator;
        bytes arguments;
    }

    struct LoanOffer {
        uint256 offerId;
        address lender;
        uint256 fee;
        address borrower;
        uint256 capacity;
        address signer;
        bool requiresLiquidation;
        address nftCollateralAddress;
        uint256 nftCollateralTokenId;
        address principalAddress;
        uint256 principalAmount;
        uint256 aprBps;
        uint256 expirationTime;
        uint256 duration;
        OfferValidator[] validators;
    }
}

interface IMultiSourceLoan {
    struct Source {
        uint256 loanId;
        address lender;
        uint256 principalAmount;
        uint256 accruedInterest;
        uint256 startTime;
        uint256 aprBps;
    }

    struct Loan {
        address borrower;
        uint256 nftCollateralTokenId;
        address nftCollateralAddress;
        address principalAddress;
        uint256 principalAmount;
        uint256 startTime;
        uint256 duration;
        Source[] source;
    }

    struct RenegotiationOffer {
        uint256 renegotiationId;
        uint256 loanId;
        address lender;
        uint256 fee;
        address signer;
        uint256[] targetPrincipal;
        uint256 principalAmount;
        uint256 aprBps;
        uint256 expirationTime;
        uint256 duration;
        bool strictImprovement;
    }
}