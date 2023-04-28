import * as Sdk from "@reservoir0x/sdk";

export type SeaportOffer = {
    buyer: string;
    nft: {
      kind: "erc721" | "erc1155";
      contract: string;
      id: number;
      // A single quantity if missing
      amount?: number;
    };
    // All offers are in WETH
    price: number;
    fees?: {
      recipient: string;
      amount: number;
    }[];
    isCancelled?: boolean;
    order?: Sdk.SeaportV14.Order
  };