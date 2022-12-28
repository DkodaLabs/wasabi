
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export interface WasabiPoolConfiguration {
    minStrikePrice: number | BN | string;
    maxStrikePrice: number | BN | string;
    minDuration: number | BN | string;
    maxDuration: number | BN | string;
}

export enum OptionType {
    CALL = 0,
    PUT = 1,
}

export interface OptionRequest {
    poolAddress: string;
    optionType: number | BN | string;
    strikePrice: number | BN | string;
    premium: number | BN | string;
    duration: number | BN | string;
    tokenId: number | BN | string;
    maxBlockToExecute: number | BN | string;
}

export interface AMMOrder {
    collection: string;
    price: number | BN | string;
    maxBlockToExecute: number | BN | string;
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
    config: WasabiPoolConfiguration,
    nftAddress: string,
    nftData?: WasabiPoolNFT,
}