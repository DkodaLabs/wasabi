import { BigNumberish } from "@ethersproject/bignumber";
import { Contract } from "@ethersproject/contracts";
import * as Sdk from "@reservoir0x/sdk";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { ethers } from "hardhat";

import { getChainId, getCurrentTimestamp } from "./utils";

// --- Listings ---

export type Listing = {
  seller: SignerWithAddress;
  nft: {
    kind: "erc721" | "erc1155";
    contract: Contract;
    id: number;
    // A single quantity if missing
    amount?: number;
  };
  // ETH if missing
  paymentToken?: string;
  price: BigNumberish;
  // Whether the order is to be cancelled
  isCancelled?: boolean;
  order?: Sdk.SeaportV14.Order;
};

export const setupListings = async (listings: Listing[]) => {
  const chainId = getChainId();

  for (const listing of listings) {
    const { seller, nft, paymentToken, price } = listing;

    // Approve the exchange contract
    if (nft.kind === "erc721") {
      await nft.contract.connect(seller).mint();
      await nft.contract
        .connect(seller)
        .setApprovalForAll(Sdk.SeaportV14.Addresses.Exchange[chainId], true);
    } else {
      await nft.contract.connect(seller).mintMany(nft.id, nft.amount ?? 1);
      await nft.contract
        .connect(seller)
        .setApprovalForAll(Sdk.SeaportV14.Addresses.Exchange[chainId], true);
    }

    // Build and sign the order
    const builder = new Sdk.SeaportBase.Builders.SingleToken(chainId);
    const order = builder.build(
      {
        side: "sell",
        tokenKind: nft.kind,
        offerer: seller.address,
        contract: nft.contract.address,
        tokenId: nft.id,
        amount: nft.amount ?? 1,
        paymentToken: paymentToken ?? Sdk.Common.Addresses.Eth[chainId],
        price,
        counter: 0,
        startTime: await getCurrentTimestamp(ethers.provider),
        endTime: (await getCurrentTimestamp(ethers.provider)) + 60,
      },
      Sdk.SeaportV14.Order
    );
    await order.sign(seller);

    listing.order = order;

    // Cancel the order if requested
    if (listing.isCancelled) {
      const exchange = new Sdk.SeaportV14.Exchange(chainId);
      await exchange.cancelOrders(seller, [order]);
    }
  }
};

// --- Offers ---

export type Offer = {
  buyer: SignerWithAddress;
  nft: {
    kind: "erc721" | "erc1155";
    contract: Contract;
    id: number;
    // A single quantity if missing
    amount?: number;
  };
  // All offers are in WETH
  price: BigNumberish;
  fees?: {
    recipient: string;
    amount: BigNumberish;
  }[];
  isCancelled?: boolean;
  order?: Sdk.SeaportV14.Order;
};

export const setupOffers = async (offers: Offer[]) => {
  const chainId = getChainId();

  for (const offer of offers) {
    const { buyer, nft, price, fees } = offer;

    const weth = new Sdk.Common.Helpers.Weth(ethers.provider, chainId);
    await weth.deposit(buyer, price);
    await weth.approve(buyer, Sdk.SeaportV14.Addresses.Exchange[chainId]);

    // Build and sign the order
    const builder = new Sdk.SeaportBase.Builders.SingleToken(chainId);
    const order = builder.build(
      {
        side: "buy",
        tokenKind: nft.kind,
        offerer: buyer.address,
        contract: nft.contract.address,
        tokenId: nft.id,
        amount: nft.amount ?? 1,
        paymentToken: weth.contract.address,
        price,
        fees,
        counter: 0,
        startTime: await getCurrentTimestamp(ethers.provider),
        endTime: (await getCurrentTimestamp(ethers.provider)) + 60,
      },
      Sdk.SeaportV14.Order
    );
    await order.sign(buyer);

    offer.order = order;

    // Cancel the order if requested
    if (offer.isCancelled) {
      const exchange = new Sdk.SeaportV14.Exchange(chainId);
      await exchange.cancelOrders(buyer, [order]);
    }
  }
};
