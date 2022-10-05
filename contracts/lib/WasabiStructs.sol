pragma solidity >=0.4.25 <0.9.0;

library WasabiStructs {
    enum OptionType { CALL, PUT }

    struct OptionRule {
        uint256 strikePrice;
        uint256 premium;
        OptionType optionType;
        uint256 tokenId;
    }
}