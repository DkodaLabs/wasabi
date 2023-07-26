// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

interface IXY3 {
    struct Signature {
        address signer;
        bytes signature;
    }

    struct BrokerSignature {
        address signer;
        bytes signature;
        uint32 expiry;
    }

    enum StatusType {
        NOT_EXISTS,
        NEW,
        RESOLVED
    }

    struct LoanDetail {
        StatusType state;
        uint64 reserved;
        uint32 loanDuration;
        uint16 adminShare;
        uint64 loanStart;
        uint8 borrowAssetIndex;
        uint32 nftAssetIndex;
        uint112 borrowAmount;
        uint112 repayAmount;
        uint256 nftTokenId;
    }

    enum ItemType {
        ERC721,
        ERC1155
    }

    struct Offer {
        ItemType itemType;
        uint256 borrowAmount;
        uint256 repayAmount;
        address nftAsset;
        address borrowAsset;
        uint256 tokenId;
        uint32 borrowDuration;
        uint32 validUntil;
        uint32 amount;
        Signature signature;
    }

    struct CallData {
        address target;
        bytes4 selector;
        bytes data;
        uint256 referral;
        address onBehalf;
        bytes32[] proof;
    }

    function loanDetails(
        uint32 _loanId
    ) external view returns (LoanDetail memory);

    function borrow(
        Offer memory _offer,
        uint256 _nftId,
        BrokerSignature memory _brokerSignature,
        CallData memory _extraData
    ) external returns (uint32);

    function repay(uint32 _loanId) external;
}
