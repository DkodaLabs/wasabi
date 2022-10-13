import { OptionRequest, OptionType, WasabiPoolConfiguration } from "./TestTypes";

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
    optionType: OptionType,
    strikePrice: any,
    premium: any,
    duration: any,
    tokenId = 0,
    maxBlockToExecute = 0
): OptionRequest => {
    return {
        poolAddress,
        optionType: optionType.valueOf(),
        strikePrice: toEth(strikePrice),
        premium: toEth(premium),
        duration,
        tokenId,
        maxBlockToExecute
    };
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

export const gasOfTxn = (receipt: TransactionReceipt): BN => {
    const gasUsed = toBN(receipt.gasUsed);
    const gasPrice = toBN(receipt.effectiveGasPrice);
    return gasPrice.mul(gasUsed);
}

export const assertIncreaseInBalance = async (address: string, initialBalance: BN, increase: BN) => {
    const newBalance = toBN(await web3.eth.getBalance(address));
    const expectedBalance = initialBalance.add(increase);
    assert.equal(newBalance.toString(), expectedBalance.toString(), "Incorrect balance in address");
}

export const advanceBlock = () => {
    return new Promise((resolve, reject) => {
        // @ts-ignore
        web3.currentProvider.send({
            jsonrpc: '2.0',
            method: 'evm_mine',
            id: new Date().getTime()
            // @ts-ignore
        }, (err, result) => {
            if (err) { return reject(err) }
            return resolve(result);
        })
    });
};

export const advanceTime = (seconds: number) => {
    return new Promise((resolve, reject) => {
        // @ts-ignore
        web3.currentProvider.send({
            jsonrpc: '2.0',
            method: 'evm_increaseTime',
            params: [seconds],
            id: new Date().getTime()
            // @ts-ignore
        }, (err, result) => {
            if (err) { return reject(err) }
            return resolve(result)
        })
    })
}