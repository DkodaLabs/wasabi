import {
  OptionRequest,
  OptionType,
  WasabiPoolConfiguration,
  AMMOrder,
  Bid,
  Ask,
  PricingConfig,
} from "./TestTypes";

import * as ethUtil from "eth-sig-util";
import { type } from "os";
import { WasabiConduitInstance } from "../../types/truffle-contracts";

export const fromWei = (value: string | BN): number => {
  return Number(web3.utils.fromWei(value, "ether"));
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
): OptionRequest => {
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
  request: OptionRequest,
  address: string
): Promise<string> => {
  const encoded = await web3.eth.abi.encodeParameter(
    {
      OptionRequest: {
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