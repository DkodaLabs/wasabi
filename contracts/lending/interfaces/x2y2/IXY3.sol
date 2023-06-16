// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

interface IXY3 {
    struct LoanDetail {
        uint256 borrowAmount;
        uint256 repayAmount;
        uint256 nftTokenId;
        address borrowAsset;
        uint32 loanDuration;
        uint16 adminShare;
        uint64 loanStart;
        address nftAsset;
        bool isCollection;
    }

    struct Offer {
        uint256 borrowAmount;
        uint256 repayAmount;
        address nftAsset;
        uint32 borrowDuration;
        address borrowAsset;
        uint256 timestamp;
        bytes extra;
    }

    struct Signature {
        uint256 nonce;
        uint256 expiry;
        address signer;
        bytes signature;
    }

    struct CallData {
        address target;
        bytes4 selector;
        bytes data;
        uint256 referral;
    }

    function loanDetails(uint32 _loanId) external view returns (LoanDetail memory);

    function borrow(
        Offer calldata _offer,
        uint256 _nftId,
        bool _isCollectionOffer,
        Signature calldata _lenderSignature,
        Signature calldata _brokerSignature,
        CallData calldata _extraDeal
    ) external returns (uint32);

    function repay(uint32 _loanId) external;
}
