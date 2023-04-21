import {
  PoolAsk,
  OptionType,
  WasabiPoolConfiguration,
  AMMOrder,
  Bid,
  Ask,
  PricingConfig,
  PoolBid,
} from "./TestTypes";

import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

import * as ethUtil from "eth-sig-util";

export const fromWei = (value: string | BN): number => {
  return Number(web3.utils.fromWei(value, "ether"));
};

export const withBid = (value: number | BN | string): BN => {
  return toBN(value).mul(toBN(1));
};

export const withBidNumber = (value: number): number => {
  return value;
};
export const toEthWithBid = (value: string | number): string => {
  return web3.utils.toWei(`${Number(value)}`, "ether");
};
export const minusBid = (value: string | number): string => {
  return web3.utils.toWei(`${Number(value)}`, "ether");
};
export const toEth = (value: string | number): string => {
  return web3.utils.toWei(`${value}`, "ether");
};
export const toBN = (value: any) => {
  return web3.utils.toBN(value);
};
export const makeData = (
  strikePrice: any,
  premium: any,
  optionType: any,
  tokenId = 0
) => {
  return {
    strikePrice: toEth(strikePrice),
    premium: toEth(premium),
    optionType,
    tokenId,
  };
};
export const makeRequest = (
  id : number,
  poolAddress: string,
  optionType: OptionType,
  strikePrice: any,
  premium: any,
  expiry: number,
  tokenId = 0,
  orderExpiry = 0
): PoolAsk => {
  return {
    id,
    poolAddress,
    optionType: optionType.valueOf(),
    strikePrice: toEth(strikePrice),
    premium: toEth(premium),
    expiry,
    tokenId,
    orderExpiry,
  };
};

export const makeRequests = (
  id : number,
  poolAddress: string,
  optionType: OptionType,
  strikePrice: any,
  premium: any,
  expiry: number,
  tokenId = 0,
  orderExpiry = 0
): PoolAsk => {
  return {
    id,
    poolAddress,
    optionType: optionType.valueOf(),
    strikePrice: strikePrice,
    premium: premium,
    expiry,
    tokenId,
    orderExpiry,
  };
};

export const makeAmmRequest = (
  collection: string,
  price: any,
  orderExpiry = 0
): AMMOrder => {
  return {
    collection,
    price: toEth(price),
    orderExpiry,
  };
};

export const makeConfig = (
  minStrikePrice: number,
  maxStrikePrice: number,
  minDuration: number,
  maxDuration: number
): WasabiPoolConfiguration => {
  return {
    minStrikePrice: toEth(minStrikePrice),
    maxStrikePrice: toEth(maxStrikePrice),
    minDuration,
    maxDuration,
  };
};

export const makeConfigs = (
  minStrikePrice: string,
  maxStrikePrice: string,
  minDuration: number,
  maxDuration: number
): WasabiPoolConfiguration => {
  return {
    minStrikePrice: minStrikePrice,
    maxStrikePrice: maxStrikePrice,
    minDuration,
    maxDuration,
  };
};

export const metadata = (
  from: string | undefined = undefined,
  value: string | number | undefined = undefined
): { from: string | undefined; value: string | undefined } => {
  return {
    from,
    value: toEth(value || 0),
  };
};

export const signRequest = async (
  request: PoolAsk,
  address: string
): Promise<string> => {
  const encoded = await web3.eth.abi.encodeParameter(
    {
      PoolAsk: {
        id: "uint256",
        poolAddress: "address",
        optionType: "uint256",
        strikePrice: "uint256",
        premium: "uint256",
        expiry: "uint256",
        tokenId: "uint256",
        orderExpiry: "uint256",
      },
    },
    request
  );
  return await signEncodedRequest(encoded, address);
};

export const signAmmRequest = async (
  request: AMMOrder,
  address: string
): Promise<string> => {
  const encoded = await web3.eth.abi.encodeParameter(
    {
      AMMOrder: {
        collection: "address",
        price: "uint256",
        orderExpiry: "uint256",
      },
    },
    request
  );
  return await signEncodedRequest(encoded, address);
};

export const signBid = async (
  request: Bid,
  address: string
): Promise<string> => {
  const encoded = await web3.eth.abi.encodeParameter(
    {
      Bid: {
        id: "uint256",
        price: "uint256",
        tokenAddress: "address",
        collection: "address",
        orderExpiry: "uint256",
        buyer: "address",
        optionType: "uint256",
        strikePrice: "uint256",
        expiry: "uint256",
        expiryAllowance: "uint256",
        optionTokenAddress: "address"
      },
    },
    request
  );
  return await signEncodedRequest(encoded, address);
};

export const signAsk = async (
  request: Ask,
  address: string
): Promise<string> => {
  const encoded = await web3.eth.abi.encodeParameter(
    {
      Ask: {
        id: "uint256",
        price: "uint256",
        tokenAddress: "address",
        orderExpiry: "uint256",
        seller: "address",
        optionId: "uint256",
      },
    },
    request
  );
  return await signEncodedRequest(encoded, address);
};

const signEncodedRequest = async (encoded: string, address: string) => {
  const hashed = await web3.utils.keccak256(encoded);
  let signed = await web3.eth.sign(hashed, address);
  let lastTwo = signed.slice(-2);
  if (lastTwo === "00") {
    signed = signed.slice(0, signed.length - 2) + "1b";
  } else if (lastTwo === "01") {
    signed = signed.slice(0, signed.length - 2) + "1c";
  }
  return signed;
};

export const signPriceConfig = async (
  request: PricingConfig,
  verifyingContract: string,
  privateKey: string
) => {
  const domain = {
    name: "PricingConfigValidator",
    version: "1",
    chainId: await web3.eth.getChainId(),
    verifyingContract,
  };

  const typeData = {
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
      PricingConfig: [
        { name: "poolAddress", type: "address" },
        { name: "premiumMultiplierPercent", type: "uint256" },
        { name: "blockNumber", type: "uint256" },
      ],
    },
    primaryType: "PricingConfig",
    domain,
    message: request,
  };
  const signature = ethUtil.signTypedData(
    Buffer.from(privateKey, "hex"),
    {
      data: typeData as any,
    }
  );
  return signature;
};
export const signBidWithEIP712 = async (
  request: Bid,
  verifyingContract: string,
  privateKey: string
) => {
  const domain = {
    name: "ConduitSignature",
    version: "1",
    chainId: await web3.eth.getChainId(),
    verifyingContract,
  };

  const typeData = {
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
      Bid: [
        { name: "id", type: "uint256" },
        { name: "price", type: "uint256" },
        { name: "tokenAddress", type: "address" },
        { name: "collection", type: "address" },
        { name: "orderExpiry", type: "uint256" },
        { name: "buyer", type: "address" },
        { name: "optionType", type: "uint8" },
        { name: "strikePrice", type: "uint256" },
        { name: "expiry", type: "uint256" },
        { name: "expiryAllowance", type: "uint256" },
        { name: "optionTokenAddress", type: "address" },
      ],
    },
    primaryType: "Bid",
    domain,
    message: request,
  };
  const signature = ethUtil.signTypedData(
    Buffer.from(privateKey, "hex"),
    {
      data: typeData as any,
    }
  );
  return signature;
};

export const signAskWithEIP712 = async (
  request: Ask,
  verifyingContract: string,
  privateKey: string
) => {
  const domain = {
    name: "ConduitSignature",
    version: "1",
    chainId: await web3.eth.getChainId(),
    verifyingContract,
  };

  const typeData = {
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
      Ask: [
        { name: "id", type: "uint256" },
        { name: "price", type: "uint256" },
        { name: "tokenAddress", type: "address" },
        { name: "orderExpiry", type: "uint256" },
        { name: "seller", type: "address" },
        { name: "optionId", type: "uint256" },
      ],
    },
    primaryType: "Ask",
    domain,
    message: request,
  };
  const signature = ethUtil.signTypedData(
    Buffer.from(privateKey, "hex"),
    {
      data: typeData as any,
    }
  );
  return signature;
};


export const signPoolAskWithEIP712 = async (
  request: PoolAsk,
  verifyingContract: string,
  privateKey: string
) => {
  const domain = {
    name: "PoolAskSignature",
    version: "1",
    chainId: await web3.eth.getChainId(),
    verifyingContract,
  };

  const typeData = {
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
      PoolAsk: [
        { name: "id", type: "uint256" },
        { name: "poolAddress", type: "address" },
        { name: "optionType", type: "uint8" },
        { name: "strikePrice", type: "uint256" },
        { name: "premium", type: "uint256" },
        { name: "expiry", type: "uint256" },
        { name: "tokenId", type: "uint256" },
        { name: "orderExpiry", type: "uint256" },
      ],
    },
    primaryType: "PoolAsk",
    domain,
    message: request,
  };
  const signature = ethUtil.signTypedData(
    Buffer.from(privateKey, "hex"),
    {
      data: typeData as any,
    }
  );
  return signature;
};

export const signPoolBidWithEIP712 = async (
  poolBid: PoolBid,
  verifyingContract: string,
  privateKey: string
) => {
  const domain = {
    name: "PoolBidVerifier",
    version: "1",
    chainId: await web3.eth.getChainId(),
    verifyingContract,
  };

  const typeData = {
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
      PoolBid: [
        { name: "id", type: "uint256" },
        { name: "price", type: "uint256" },
        { name: "tokenAddress", type: "address" },
        { name: "orderExpiry", type: "uint256" },
        { name: "optionId", type: "uint256" },
      ]
    },
    primaryType: "PoolBid",
    domain,
    message: poolBid,
  };
  const signature = ethUtil.signTypedData(
    Buffer.from(privateKey, "hex"),
    {
      data: typeData as any,
    }
  );
  return signature;
};

export const signPoolAsk = async (
  request: PoolAsk,
  verifyingContract: string,
  buyer: SignerWithAddress,
  chainId: number
) => {
  const domain = {
    name: "PoolAskSignature",
    version: "1",
    chainId: chainId,
    verifyingContract,
  };

  const types = {
      PoolAsk: [
        { name: "id", type: "uint256" },
        { name: "poolAddress", type: "address" },
        { name: "optionType", type: "uint8" },
        { name: "strikePrice", type: "uint256" },
        { name: "premium", type: "uint256" },
        { name: "expiry", type: "uint256" },
        { name: "tokenId", type: "uint256" },
        { name: "orderExpiry", type: "uint256" },
      ],
    };

    const value = {
      id: request.id,
      poolAddress: request.poolAddress,
      optionType: request.optionType,
      strikePrice: request.strikePrice,
      premium: request.premium,
      expiry: request.expiry,
      tokenId: request.tokenId,
      orderExpiry: request.orderExpiry,
    };

  const signature = await buyer._signTypedData(domain, types, value);
  // return utils.splitSignature(signature);
  return signature;
};

export const gasOfTxn = (receipt: TransactionReceipt): BN => {
  const gasUsed = toBN(receipt.gasUsed);
  const gasPrice = toBN(receipt.effectiveGasPrice);
  return gasPrice.mul(gasUsed);
};

export const assertIncreaseInBalance = async (
  address: string,
  initialBalance: BN,
  increase: BN
) => {
  const newBalance = toBN(await web3.eth.getBalance(address));
  const expectedBalance = initialBalance.add(increase);
  assert.equal(
    newBalance.toString(),
    expectedBalance.toString(),
    "Incorrect balance in address"
  );
};

export const advanceBlock = () => {
  return new Promise((resolve, reject) => {
    // @ts-ignore
    web3.currentProvider.send(
      {
        jsonrpc: "2.0",
        method: "evm_mine",
        id: new Date().getTime(),
      },
      // @ts-ignore
      (err, result) => {
        if (err) {
          return reject(err);
        }
        return resolve(result);
      }
    );
  });
};

export const advanceTime = (seconds: number) => {
  return new Promise((resolve, reject) => {
    // @ts-ignore
    web3.currentProvider.send(
      {
        jsonrpc: "2.0",
        method: "evm_increaseTime",
        params: [seconds],
        id: new Date().getTime(),
      },
      // @ts-ignore
      (err, result) => {
        if (err) {
          return reject(err);
        }
        return resolve(result);
      }
    );
  });
};

export async function expectRevertCustomError(promise: Promise<any>, customError: string, errorMessage?: string) {
  try {
    await promise;
    expect.fail(errorMessage || `Expected to fail with custom error [${customError}], but it didn't.`);
  } catch (reason) {
      if (reason) {
        // @ts-ignore
        const reasonId = reason.data.result || reason.data;
        const expectedId = web3.eth.abi.encodeFunctionSignature(`${customError}()`);
        assert.equal(
          reasonId,
          expectedId,
          `Expected to fail with custom error [${customError}], but failed with ${reasonId}`
        )
      }
  }
}