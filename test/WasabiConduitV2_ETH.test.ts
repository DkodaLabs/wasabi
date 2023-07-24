const truffleAssert = require("truffle-assertions");

import {
  toEth,
  fromWei,
  gasOfTxn,
  makeV2Request,
  metadata,
  signPoolAskV2WithEIP712,
  signAskV2WithEIP712,
  expectRevertCustomError,
  toBN,
  getAllTokenIds,
} from "./util/TestUtils";
import { Ask, PoolAskV2, OptionType, ZERO_ADDRESS } from "./util/TestTypes";
import { TestERC721Instance } from "../types/truffle-contracts/TestERC721.js";
import { WasabiPoolFactoryV2Instance } from "../types/truffle-contracts/WasabiPoolFactoryV2.js";
import { WasabiOptionInstance } from "../types/truffle-contracts/WasabiOption.js";
import { ETHWasabiPoolV2Instance } from "../types/truffle-contracts/ETHWasabiPoolV2.js";
import { WasabiConduitV2Instance } from "../types/truffle-contracts/WasabiConduitV2";
import { WasabiFeeManagerInstance } from "../types/truffle-contracts/WasabiFeeManager";

const WasabiPoolFactoryV2 = artifacts.require("WasabiPoolFactoryV2");
const WasabiOption = artifacts.require("WasabiOption");
const ETHWasabiPoolV2 = artifacts.require("ETHWasabiPoolV2");
const TestERC721 = artifacts.require("TestERC721");
const WasabiConduitV2 = artifacts.require("WasabiConduitV2");
const WasabiFeeManager = artifacts.require("WasabiFeeManager");

contract("WasabiConduitV2 ETH", (accounts) => {
  let poolFactory: WasabiPoolFactoryV2Instance;
  let option: WasabiOptionInstance;
  let testNft: TestERC721Instance;
  let poolAddress: string;
  let pool: ETHWasabiPoolV2Instance;
  let optionId: BN;
  let request: PoolAskV2;
  let conduit: WasabiConduitV2Instance;
  let feeManager: WasabiFeeManagerInstance;
  let royaltyPayoutPercent = 20;
  const originalPayoutPercent = 1000;

  const admin = accounts[0];
  const lp = accounts[2];
  const buyer = accounts[3];
  const someoneElse = accounts[5];
  const buyerPrivateKey =
    "c88b703fb08cbea894b6aeff5a544fb92e78a18e19814cd85da83b71f772aa6c";
  const someoneElsePrivateKey =
    "659cbb0e2411a44db63778987b1e22153c086a95eb6b18bdf89de078917abc63";
  const lpPrivateKey =
    "0dbbe8e4ae425a6d2687f1a7e3ba17bc98c673636790f1b8ad91193c05875ef1";

  let signature;
  before("Prepare State", async function () {
    conduit = await WasabiConduitV2.deployed();
    testNft = await TestERC721.deployed();
    option = await WasabiOption.deployed();
    poolFactory = await WasabiPoolFactoryV2.deployed();
    await option.toggleFactory(poolFactory.address, true);

    await conduit.setPoolFactoryAddress(poolFactory.address);
    await conduit.setOption(option.address);
    feeManager = await WasabiFeeManager.deployed();

    // Set Fee
    await feeManager.setFraction(royaltyPayoutPercent);
    await feeManager.setDenominator(originalPayoutPercent);

    await testNft.mint(metadata(lp));
    await testNft.mint(metadata(lp));
    await testNft.mint(metadata(lp));
  });

  it("Create Pool", async () => {
    await testNft.setApprovalForAll.sendTransaction(
      poolFactory.address,
      true,
      metadata(lp)
    );

    const createPoolResult = await poolFactory.createPool(
      [testNft.address, testNft.address, testNft.address],
      [1001, 1002, 1003],
      admin,
      metadata(lp)
    );
    truffleAssert.eventEmitted(
      createPoolResult,
      "NewPool",
      null,
      "Pool wasn't created"
    );
    truffleAssert.eventEmitted(
      createPoolResult,
      "OwnershipTransferred",
      { previousOwner: ZERO_ADDRESS, newOwner: lp },
      "Pool didn't change owners correctly"
    );

    poolAddress = createPoolResult.logs.find((e) => e.event == "NewPool")!
      .args[0];
    pool = await ETHWasabiPoolV2.at(poolAddress);
    assert.equal(await pool.owner(), lp, "Pool creator and owner not same");
    assert.deepEqual(
      await getAllTokenIds(pool.address, testNft),
      [1001, 1002, 1003],
      "Pool doesn't have the correct tokens"
    );
  });

  it("Write Option (only owner)", async () => {
    const id = 1;
    let blockNumber = await web3.eth.getBlockNumber();
    let timestamp = Number((await web3.eth.getBlock(blockNumber)).timestamp);
    let expiry = timestamp + 10000;
    let orderExpiry = timestamp + 10000;
    const premium = 1;
    request = makeV2Request(
      id,
      pool.address,
      OptionType.CALL,
      10,
      premium,
      expiry,
      testNft.address,
      1001,
      orderExpiry
    );

    const amount =
      (premium * (originalPayoutPercent + royaltyPayoutPercent)) /
      originalPayoutPercent;
    signature = await signPoolAskV2WithEIP712(
      request,
      pool.address,
      lpPrivateKey
    );
    optionId = await conduit.buyOption.call(
      request,
      signature,
      metadata(buyer, amount)
    );
    await conduit.buyOption(request, signature, metadata(buyer, amount));

    assert.equal(
      await web3.eth.getBalance(pool.address),
      request.premium,
      "Incorrect balance in pool"
    );

    assert.equal(
      await option.ownerOf(optionId),
      buyer,
      "Buyer not the owner of option"
    );
    const expectedOptionId = await pool.getOptionIdForToken(request.nft, request.tokenId);
    assert.equal(
      expectedOptionId.toNumber(),
      optionId.toNumber(),
      "Option of token not correct"
    );

    request.id = request.id + 1;
    signature = await signPoolAskV2WithEIP712(
      request,
      pool.address,
      lpPrivateKey
    );
    await expectRevertCustomError(
      pool.writeOption.sendTransaction(
        request,
        signature,
        metadata(buyer, amount)
      ),
      "RequestNftIsLocked",
      "Cannot (re)write an option for a locked asset"
    );
  });

  it("Accept ask", async () => {
    const price = 1;
    let optionOwner = await option.ownerOf(optionId);

    await option.setApprovalForAll(
      conduit.address,
      true,
      metadata(optionOwner)
    );

    let blockTimestamp = await (
      await web3.eth.getBlock(await web3.eth.getBlockNumber())
    ).timestamp;
    const ask: Ask = {
      id: 1,
      optionId: optionId.toString(),
      orderExpiry: Number(blockTimestamp) + 20,
      price: toEth(price),
      seller: optionOwner,
      tokenAddress: ZERO_ADDRESS,
    };

    const signature = await signAskV2WithEIP712(
      ask,
      conduit.address,
      buyerPrivateKey
    );

    // Fee Manager
    const royaltyReceiver = await feeManager.owner();
    const initialRoyaltyReceiverBalance = toBN(
      await web3.eth.getBalance(royaltyReceiver)
    );

    const initialBalanceBuyer = toBN(await web3.eth.getBalance(someoneElse));
    const initialBalanceSeller = toBN(await web3.eth.getBalance(optionOwner));

    const acceptAskResult = await conduit.acceptAsk(
      ask,
      signature,
      metadata(someoneElse, price)
    );

    const finalBalanceBuyer = toBN(await web3.eth.getBalance(someoneElse));
    const finalBalanceSeller = toBN(await web3.eth.getBalance(optionOwner));
    const finalRoyaltyReceiverBalance = toBN(
      await web3.eth.getBalance(royaltyReceiver)
    );

    truffleAssert.eventEmitted(
      acceptAskResult,
      "AskTaken",
      null,
      "Ask wasn't taken"
    );
    assert.equal(
      await option.ownerOf(optionId),
      someoneElse,
      "Option not owned after buying"
    );

    const royaltyAmount =
      (price * royaltyPayoutPercent) / originalPayoutPercent;
    const sellerAmount = price - royaltyAmount;

    assert.equal(
      fromWei(finalBalanceSeller.sub(initialBalanceSeller).toString()),
      sellerAmount,
      "Seller incorrect balance change"
    );
    assert.equal(
      fromWei(initialBalanceBuyer.sub(finalBalanceBuyer).toString()),
      price + fromWei(gasOfTxn(acceptAskResult.receipt)),
      "Seller incorrect balance change"
    );

    // // Fee Manager
    assert.equal(
      fromWei(
        finalRoyaltyReceiverBalance
          .sub(initialRoyaltyReceiverBalance)
          .toString()
      ),
      royaltyAmount,
      "Fee receiver incorrect balance change"
    );
  });

  it("Cancel ask", async () => {
    const price = 1;
    let optionOwner = await option.ownerOf(optionId);

    await option.setApprovalForAll(
      conduit.address,
      true,
      metadata(optionOwner)
    );

    let blockTimestamp = await (
      await web3.eth.getBlock(await web3.eth.getBlockNumber())
    ).timestamp;
    const ask: Ask = {
      id: 3,
      optionId: optionId.toString(),
      orderExpiry: Number(blockTimestamp) + 20,
      price: toEth(price),
      seller: optionOwner,
      tokenAddress: ZERO_ADDRESS,
    };

    const signature = await signAskV2WithEIP712(
      ask,
      conduit.address,
      someoneElsePrivateKey
    );
    const cancelAskResult = await conduit.cancelAsk(
      ask,
      signature,
      metadata(someoneElse)
    );
    truffleAssert.eventEmitted(
      cancelAskResult,
      "AskCancelled",
      null,
      "Ask wasn't cancelled"
    );

    await truffleAssert.reverts(
      conduit.acceptAsk(ask, signature, metadata(someoneElse, price)),
      "Order was finalized or cancelled",
      "Can execute cancelled ask"
    );
  });
});
