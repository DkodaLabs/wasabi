import {OptionRequest, WasabiPoolConfiguration} from "./TestTypes";

export const toEth = (value: string | number): string => {
    return web3.utils.toWei(`${value}`, "ether");
}
export const toBN = (value: any) => {
    return web3.utils.toBN(value);
}
export const makeData = (strikePrice: any, premium: any, optionType: any, tokenId = 0) => {
    return { strikePrice: toEth(strikePrice), premium: toEth(premium), optionType, tokenId };
}
export const makeRequest = (
    poolAddress: string,
    optionType: any, 
    strikePrice: any,
    premium: any,
    duration: any,
    tokenId = 0,
    maxBlockToExecute = 0
) => {
    return { poolAddress, optionType, strikePrice: toEth(strikePrice), premium: toEth(premium), duration, tokenId, maxBlockToExecute };
}
export const makeConfig = (
    minStrikePrice: number,
    maxStrikePrice: number,
    minDuration: number,
    maxDuration: number): WasabiPoolConfiguration => {
    return { minStrikePrice: toEth(minStrikePrice), maxStrikePrice: toEth(maxStrikePrice), minDuration, maxDuration };
}

export const metadata = (
    from: string | undefined = undefined,
    value: string | number | undefined = undefined): { from: string | undefined, value: string | undefined } => {
        return {
             from,
             value: toEth(value || 0)
        };
    }

export const signRequest = async (request: OptionRequest, address: string) => {
    let encoded = await web3.eth.abi.encodeParameter(
        {
            "OptionRequest": {
                "poolAddress": "address",
                "optionType": "uint256",
                "strikePrice": "uint256",
                "premium": "uint256",
                "duration": "uint256",
                "tokenId": "uint256",
                "maxBlockToExecute": "uint256"
            }
        },
        request);
    encoded = await web3.utils.keccak256(encoded);
    return await web3.eth.sign(encoded, address);
    // return (await web3.eth.accounts.sign(encoded, "dbe5766890ceccabed337e302e227f7b11b1361a158744841f79ffbe74a6c564")).signature;
}