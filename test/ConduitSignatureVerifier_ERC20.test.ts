import { toEth, signBidWithEIP712 ,signAskWithEIP712} from "./util/TestUtils";
import { Bid , Ask} from "./util/TestTypes";
import { WasabiConduitInstance } from "../types/truffle-contracts/WasabiConduit";

const WasabiConduit = artifacts.require("WasabiConduit");

contract("ConduitSignatureVerifier ERC20", (accounts) => {
  let conduit: WasabiConduitInstance;
  const buyer = accounts[3];

  before("Prepare State", async function () {
    conduit = await WasabiConduit.deployed();
  });

  it("Verify signer for Bid", async () => {
    let blockTimestamp = await (
      await web3.eth.getBlock(await web3.eth.getBlockNumber())
    ).timestamp;
    const bid: Bid = {
      id: 2,
      price: toEth(1),
      tokenAddress: "0x0000000000000000000000000000000000000000",
      collection: "0x0000000000000000000000000000000000000000",
      orderExpiry: Number(blockTimestamp) + 20,
      buyer,
      optionType: 1,
      strikePrice: 1000,
      expiry: Number(blockTimestamp) + 20000,
      expiryAllowance: 0,
    };

    const signatureForBid = await signBidWithEIP712(
      bid,
      conduit.address
    ); // buyer signs it

    assert.equal(
      await conduit.getSignerForBid(bid, signatureForBid),
      buyer,
      "invalid signer"
    );
  });
  it("Verify signer for Ask", async () => {
    let blockTimestamp = await (
      await web3.eth.getBlock(await web3.eth.getBlockNumber())
    ).timestamp;
    const ask: Ask = {
      id: 3,
      optionId: 1,
      orderExpiry: Number(blockTimestamp) + 20,
      price: toEth(1000),
      seller: "0x0000000000000000000000000000000000000000",
      tokenAddress: "0x0000000000000000000000000000000000000000",
  };

    const signatureForAsk = await signAskWithEIP712(
      ask,
      conduit.address,
    ); // buyer signs it

    assert.equal(
      await conduit.getSignerForAsk(ask, signatureForAsk),
      buyer,
      "invalid signer"
    );
  });
});
