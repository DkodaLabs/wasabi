import { OptionRequest, OptionType, WasabiPoolConfiguration, AMMOrder, Bid, Ask } from "./TestTypes";

export const fromWei = (value: string | BN): number  => {
    return Number(web3.utils.fromWei(value, "ether"));
}

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
    duration: number,
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

export const makeAmmRequest = (
    collection: string,
    price: any,
    maxBlockToExecute = 0
): AMMOrder => {
    return {
        collection,
        price: toEth(price),
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

export const signRequest = async (request: OptionRequest, address: string): Promise<string> => {
    const encoded = await web3.eth.abi.encodeParameter(
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
    return await signEncodedRequest(encoded, address);
}

export const signAmmRequest = async (request: AMMOrder, address: string): Promise<string> => {
    const encoded = await web3.eth.abi.encodeParameter(
        {
            "AMMOrder": {
                "collection": "address",
                "price": "uint256",
                "maxBlockToExecute": "uint256"
            }
        },
        request);
    return await signEncodedRequest(encoded, address);
}

export const signBid = async (request: Bid, address: string): Promise<string> => {
    const encoded = await web3.eth.abi.encodeParameter(
        {
            "Bid": {
                "id": "uint256",
                "price": "uint256",
                "tokenAddress": "address",
                "collection": "address",
                "orderExpiry": "uint256",
                "buyer": "address",
                "optionType": "uint256",
                "strikePrice": "uint256",
                "expiry": "uint256",
                "expiryAllowance": "uint256",
            }
        },
        request);
    return await signEncodedRequest(encoded, address);
}

export const signAsk = async (request: Ask, address: string): Promise<string> => {
    const encoded = await web3.eth.abi.encodeParameter(
        {
            "Ask": {
                "id": "uint256",
                "price": "uint256",
                "tokenAddress": "address",
                "orderExpiry": "uint256",
                "seller": "address",
                "optionId": "uint256",
            }
        },
        request);
    return await signEncodedRequest(encoded, address);
}

const signEncodedRequest = async (encoded: string, address: string) => {
    const hashed = await web3.utils.keccak256(encoded);
    let signed = await web3.eth.sign(hashed, address);
    let lastTwo = signed.slice(-2);
    if (lastTwo === '00') {
        signed = signed.slice(0, signed.length - 2) + '1b';
    } else if (lastTwo === '01') {
        signed = signed.slice(0, signed.length - 2) + '1c';
    }
    return signed;
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