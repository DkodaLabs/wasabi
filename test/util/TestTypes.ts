
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export enum OptionType {
    CALL = 0,
    PUT = 1,
}

export enum PoolState {
    INVALID = 0,
    ACTIVE = 1,
    DISABLED = 2,
}

export interface OptionData {
    optionType: BN;
    strikePrice: BN;
    expiry: BN;
    tokenId: BN;
}

export interface PoolAsk {
    id: number;
    poolAddress: string;
    optionType: number | BN | string;
    strikePrice: number | BN | string;
    premium: number | BN | string;
    expiry: number | BN | string;
    tokenId: number | BN | string;
    orderExpiry: number | BN | string;
}

export interface FunctionCallData {
    to: string;
    value: number | BN | string;
    data: number | BN | string;
}

export interface PoolBid {
    id: number | BN | string;
    price: number | BN | string;
    tokenAddress: string;
    orderExpiry: number | BN | string;
    optionId: number | BN | string;
}

export interface PricingConfig {
    poolAddress: string;
    premiumMultiplierPercent: number | BN | string;
    blockNumber: number | BN | string;
}
export interface Bid {
    id: number | BN | string;
    price: number | BN | string;
    tokenAddress: string;
    collection: string;
    orderExpiry: number | BN | string;
    buyer: string;
    optionType: number | BN | string;
    strikePrice: number | BN | string;
    expiry: number | BN | string;
    expiryAllowance: number | BN | string;
    optionTokenAddress: string;
}

export interface Ask {
    id: number | BN | string;
    price: number | BN | string;
    tokenAddress: string;
    orderExpiry: number | BN | string;
    seller: string;
    optionId: number | BN | string;
}

export interface AMMOrder {
    collection: string;
    price: number | BN | string;
    orderExpiry: number | BN | string;
}

export interface WasabiPoolNFT {
    name: string,
    symbol: string,
    balanceOf: BN
}

export interface WasabiPool {
    address: string,
    owner: string,
    availableBalance: BN,
    admin: string,
    nftAddress: string,
    nftData?: WasabiPoolNFT,
}