// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.4.25 <0.9.0;

library WasabiStructs {
    enum OptionType { CALL, PUT }

    struct OptionData {
        OptionType optionType;
        uint256 strikePrice;
        uint256 premium;
        uint256 expiry;
        uint256 tokenId; // Tokens to deposit for CALL options
    }

    struct OptionRequest {
        address poolAddress;
        OptionType optionType;
        uint256 strikePrice;
        uint256 premium;
        uint256 duration;
        uint256 tokenId; // Tokens to deposit for CALL options
        uint256 maxBlockToExecute;
    }

    struct PoolConfiguration {
        uint256 minStrikePrice;
        uint256 maxStrikePrice;
        uint256 minDuration;
        uint256 maxDuration;
    }
}