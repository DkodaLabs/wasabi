/* eslint-disable @typescript-eslint/no-explicit-any */

import { Interface } from "@ethersproject/abi";
import { Provider } from "@ethersproject/abstract-provider";
import { BigNumberish, BigNumber } from "@ethersproject/bignumber";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import * as Sdk from "@reservoir0x/sdk";
import { ethers, network } from "hardhat";

// --- Misc ---

export const bn = (value: BigNumberish) => BigNumber.from(value);

export const lc = (value: string) => value.toLowerCase();

export const getCurrentTimestamp = async (provider: Provider) =>
  provider.getBlock("latest").then((b) => b.timestamp);

export const getRandomBoolean = () => Math.random() < 0.5;

export const getRandomInteger = (min: number, max: number) => {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

export const getRandomFloat = (min: number, max: number) => Math.random() * (max - min) + min;

// --- Network ---

// Reset forked network state
export const reset = async () => {
  if ((network.config as any).forking) {
    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: (network.config as any).forking.url,
            blockNumber: (network.config as any).forking.blockNumber,
          },
        },
      ],
    });
  }
};

// Retrieve the forked network's chain id
export const getChainId = () => ((network.config as any).forking?.url.includes("goerli") ? 5 : 1);

// --- Deployments ---

// Deploy mock ERC20 contract
export const setupTokens = async (deployer: SignerWithAddress) => {
  const erc20: any = await ethers
    .getContractFactory("MockERC20", deployer)
    .then((factory) => factory.deploy());

  return { erc20 };
};

// Deploy mock ERC721/1155 contracts
export const setupNFTs = async (deployer: SignerWithAddress) => {
  const erc721: any = await ethers
    .getContractFactory("TestERC721", deployer)
    .then((factory) => factory.deploy());

  return erc721;
};

export const setupConduit = async (
  chainId: number,
  deployer: SignerWithAddress,
  channels: string[]
) => {
  const iface = new Interface([
    "function createConduit(bytes32 conduitKey, address initialOwner) returns (address)",
    "function updateChannel(address conduit, address channel, bool isOpen) external",
  ]);

  const conduitKey = `${deployer.address}000000000000000000000000`;

  await deployer.sendTransaction({
    to: Sdk.SeaportBase.Addresses.ConduitController[chainId],
    data: iface.encodeFunctionData("createConduit", [conduitKey, deployer.address]),
  });

  for (const channel of channels) {
    await deployer.sendTransaction({
      to: Sdk.SeaportBase.Addresses.ConduitController[chainId],
      data: iface.encodeFunctionData("updateChannel", [
        new Sdk.SeaportBase.ConduitController(chainId).deriveConduit(conduitKey),
        channel,
        true,
      ]),
    });
  }

  return conduitKey;
};

// Deploy router with modules and override any SDK addresses
export const setupRouterWithModules = async (chainId: number, deployer: SignerWithAddress) => {
  // Deploy router

  const router = await ethers
    .getContractFactory("ReservoirV6_0_1", deployer)
    .then((factory) => factory.deploy());
  Sdk.RouterV6.Addresses.Router[chainId] = router.address.toLowerCase();

  // Deploy modules

  const looksRareModule = await ethers
    .getContractFactory("LooksRareModule", deployer)
    .then((factory) =>
      factory.deploy(deployer.address, router.address, Sdk.LooksRare.Addresses.Exchange[chainId])
    );
  Sdk.RouterV6.Addresses.LooksRareModule[chainId] = looksRareModule.address.toLowerCase();

  const seaportModule = await ethers
    .getContractFactory("SeaportModule", deployer)
    .then((factory) =>
      factory.deploy(deployer.address, router.address, Sdk.SeaportV11.Addresses.Exchange[chainId])
    );
  Sdk.RouterV6.Addresses.SeaportModule[chainId] = seaportModule.address.toLowerCase();

  const seaportV14Module = await ethers
    .getContractFactory("SeaportV14Module", deployer)
    .then((factory) =>
      factory.deploy(deployer.address, router.address, Sdk.SeaportV14.Addresses.Exchange[chainId])
    );
  Sdk.RouterV6.Addresses.SeaportV14Module[chainId] = seaportV14Module.address.toLowerCase();

  const zeroExV4Module = await ethers
    .getContractFactory("ZeroExV4Module", deployer)
    .then((factory) =>
      factory.deploy(deployer.address, router.address, Sdk.ZeroExV4.Addresses.Exchange[chainId])
    );
  Sdk.RouterV6.Addresses.ZeroExV4Module[chainId] = zeroExV4Module.address.toLowerCase();

  const swapModule = (await ethers
    .getContractFactory("SwapModule", deployer)
    .then((factory) =>
      factory.deploy(
        deployer.address,
        deployer.address,
        Sdk.Common.Addresses.Weth[chainId],
        Sdk.Common.Addresses.SwapRouter[chainId]
      )
    )) as any;
  Sdk.RouterV6.Addresses.SwapModule[chainId] = swapModule.address.toLowerCase();

  const approvalProxy = await ethers
    .getContractFactory("ReservoirApprovalProxy", deployer)
    .then((factory) =>
      factory.deploy(Sdk.SeaportBase.Addresses.ConduitController[chainId], router.address)
    );
  Sdk.RouterV6.Addresses.ApprovalProxy[chainId] = approvalProxy.address.toLowerCase();

  const conduitKey = await setupConduit(chainId, deployer, [approvalProxy.address]);
  Sdk.SeaportBase.Addresses.ReservoirConduitKey[chainId] = conduitKey;
};
