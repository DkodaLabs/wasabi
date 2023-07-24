const truffleAssert = require("truffle-assertions");

import {
  toEth,
  toBN,
  makeV2Request,
  metadata,
  fromWei,
  expectRevertCustomError,
  signAskV2WithEIP712,
  signBidV2WithEIP712,
  signPoolAskV2WithEIP712,
  signPoolBidV2WithEIP712,
  getAllTokenIds,
  assertIncreaseInBalance,
  gasOfTxn,
  advanceTime,
  advanceBlock,
} from "./util/TestUtils";
import {
  PoolAskV2,
  PoolBid,
  OptionType,
  ZERO_ADDRESS,
  Bid,
  Ask,
  PoolState,
} from "./util/TestTypes";
import {
  TestERC721Instance,
  WasabiPoolFactoryV2Instance,
  WasabiConduitV2Instance,
  WasabiOptionInstance,
} from "../types/truffle-contracts";
import {
  ERC20WasabiPoolV2Instance,
  OptionIssued,
  OptionExecuted,
} from "../types/truffle-contracts/ERC20WasabiPoolV2.js";
import { DemoETHInstance } from "../types/truffle-contracts";
import { Transfer } from "../types/truffle-contracts/ERC721";

const WasabiPoolFactoryV2 = artifacts.require("WasabiPoolFactoryV2");
const WasabiConduitV2 = artifacts.require("WasabiConduitV2");
const WasabiOption = artifacts.require("WasabiOption");
const ERC20WasabiPoolV2 = artifacts.require("ERC20WasabiPoolV2");
const TestERC721 = artifacts.require("TestERC721");
const DemoETH = artifacts.require("DemoETH");

contract("ERC20WasabiPoolV2: Accept Ask From Pool", (accounts) => {
  let token: DemoETHInstance;
  let poolFactory: WasabiPoolFactoryV2Instance;
  let conduit: WasabiConduitV2Instance;
  let option: WasabiOptionInstance;
  let testNft: TestERC721Instance;
  let poolAddress: string;
  let pool: ERC20WasabiPoolV2Instance;
  let optionId: BN;
  let request: PoolAskV2;

  const owner = accounts[0];
  const lp = accounts[2];
  const buyer = accounts[3];
  const someoneElse = accounts[5];
  const lpPrivateKey =
    "0dbbe8e4ae425a6d2687f1a7e3ba17bc98c673636790f1b8ad91193c05875ef1";

  before("Prepare State", async function () {
    token = await DemoETH.deployed();
    testNft = await TestERC721.deployed();
    option = await WasabiOption.deployed();
    poolFactory = await WasabiPoolFactoryV2.deployed();
    conduit = await WasabiConduitV2.deployed();
    await option.toggleFactory(poolFactory.address, true);
    await conduit.setOption(option.address);
    await conduit.setPoolFactoryAddress(poolFactory.address);
    poolFactory.setConduitAddress(conduit.address);

    await token.mint(metadata(buyer));
    await token.mint(metadata(lp));

    await testNft.mint(metadata(lp));
    await testNft.mint(metadata(lp));
    await testNft.mint(metadata(lp));
    await testNft.mint(metadata(lp));
    await testNft.mint(metadata(someoneElse));
    await testNft.mint(metadata(buyer));
    await testNft.mint(metadata(buyer));
  });

  it("Create Pool", async () => {
    assert.equal(
      (await token.balanceOf(buyer)).toString(),
      toEth(100),
      "Not enough minted"
    );

    await testNft.setApprovalForAll.sendTransaction(
      poolFactory.address,
      true,
      metadata(lp)
    );

    const createPoolResult = await poolFactory.createERC20Pool(
      token.address,
      0,
      [testNft.address, testNft.address, testNft.address, testNft.address],
      [1001, 1002, 1003, 1004],
      ZERO_ADDRESS,
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
    pool = await ERC20WasabiPoolV2.at(poolAddress);
    assert.equal(await pool.owner(), lp, "Pool creator and owner not same");
    assert.deepEqual(
      await getAllTokenIds(pool.address, testNft),
      [1001, 1002, 1003, 1004],
      "Pool doesn't have the correct tokens"
    );

    assert.equal(
      await pool.getLiquidityAddress(),
      token.address,
      "Token not correct"
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
      1003,
      orderExpiry
    );

    await token.approve(conduit.address, toEth(premium * 10), metadata(lp));

    const prev_pool_balance = await token.balanceOf(pool.address);
    let signature = await signPoolAskV2WithEIP712(
      request,
      pool.address,
      lpPrivateKey
    );
    optionId = await conduit.buyOption.call(request, signature, metadata(lp));
    await conduit.buyOption(request, signature, metadata(lp));

    const after_pool_balance = await token.balanceOf(pool.address);

    assert.equal(
      prev_pool_balance.add(toBN(request.premium)).toString(),
      after_pool_balance.toString()
    );

    assert.equal(
      await option.ownerOf(optionId),
      lp,
      "Buyer not the owner of option"
    );
    const expectedOptionId = await pool.getOptionIdForToken(
      request.nft,
      request.tokenId
    );
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
      conduit.buyOption(request, signature, metadata(lp)),
      "RequestNftIsLocked"
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
      tokenAddress: token.address,
    };

    const signature = await signAskV2WithEIP712(
      ask,
      conduit.address,
      lpPrivateKey
    );

    const initialBalanceSeller = await token.balanceOf(optionOwner);
    const acceptAskResult = await pool.acceptAsk(ask, signature, metadata(lp));
    const finalBalanceSeller = await token.balanceOf(optionOwner);
    const resultsOfConduit = await truffleAssert.createTransactionResult(
      conduit,
      acceptAskResult.tx
    );

    await truffleAssert.eventEmitted(
      resultsOfConduit,
      "AskTaken",
      null,
      "Ask wasn't taken"
    );

    assert.equal(
      fromWei(finalBalanceSeller.sub(initialBalanceSeller)),
      price,
      "Seller incorrect balance change"
    );
  });
});

contract("ERC20WasabiPoolV2: Accept Bid From Pool", (accounts) => {
  let token: DemoETHInstance;
  let poolFactory: WasabiPoolFactoryV2Instance;
  let conduit: WasabiConduitV2Instance;
  let option: WasabiOptionInstance;
  let testNft: TestERC721Instance;
  let poolAddress: string;
  let pool: ERC20WasabiPoolV2Instance;

  const owner = accounts[0];
  const lp = accounts[2];
  const buyer = accounts[3];
  const someoneElse = accounts[5];
  const buyerPrivateKey =
    "c88b703fb08cbea894b6aeff5a544fb92e78a18e19814cd85da83b71f772aa6c";
  const lpPrivateKey =
    "0dbbe8e4ae425a6d2687f1a7e3ba17bc98c673636790f1b8ad91193c05875ef1";

  before("Prepare State", async function () {
    token = await DemoETH.deployed();
    testNft = await TestERC721.deployed();
    option = await WasabiOption.deployed();
    poolFactory = await WasabiPoolFactoryV2.deployed();
    conduit = await WasabiConduitV2.deployed();
    await option.toggleFactory(poolFactory.address, true);
    await conduit.setPoolFactoryAddress(poolFactory.address);
    await conduit.setOption(option.address);
    await poolFactory.setConduitAddress(conduit.address);

    await token.mint(metadata(buyer));
    await token.mint(metadata(lp));

    await testNft.mint(metadata(lp));
    await testNft.mint(metadata(lp));
    await testNft.mint(metadata(lp));
    await testNft.mint(metadata(lp));
    await testNft.mint(metadata(someoneElse));
    await testNft.mint(metadata(buyer));
    await testNft.mint(metadata(buyer));
  });

  it("Create Pool", async () => {
    assert.equal(
      (await token.balanceOf(buyer)).toString(),
      toEth(100),
      "Not enough minted"
    );

    await testNft.setApprovalForAll.sendTransaction(
      poolFactory.address,
      true,
      metadata(lp)
    );

    const createPoolResult = await poolFactory.createERC20Pool(
      token.address,
      0,
      [testNft.address, testNft.address, testNft.address, testNft.address],
      [1001, 1002, 1003, 1004],
      ZERO_ADDRESS,
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
    pool = await ERC20WasabiPoolV2.at(poolAddress);
    assert.equal(await pool.owner(), lp, "Pool creator and owner not same");
    assert.deepEqual(
      await getAllTokenIds(pool.address, testNft),
      [1001, 1002, 1003, 1004],
      "Pool doesn't have the correct tokens"
    );

    assert.equal(
      await pool.getLiquidityAddress(),
      token.address,
      "Token not correct"
    );
  });

  it("Accept Call Bid with tokenId - (only owner)", async () => {
    const price = 1;
    const strikePrice = 10;
    let blockTimestamp = await (
      await web3.eth.getBlock(await web3.eth.getBlockNumber())
    ).timestamp;
    const bid: Bid = {
      id: 2,
      price: toEth(price),
      tokenAddress: token.address,
      collection: testNft.address,
      orderExpiry: Number(blockTimestamp) + 20,
      buyer,
      optionType: OptionType.CALL,
      strikePrice: toEth(strikePrice),
      expiry: Number(blockTimestamp) + 20000,
      expiryAllowance: 0,
      optionTokenAddress: token.address,
    };

    const tokenIds = await getAllTokenIds(pool.address, testNft);
    let tokenId = 0;
    for (let i = 0; i < tokenIds.length; i++) {
      if (
        await pool.isAvailableTokenId(testNft.address, tokenIds[i].valueOf())
      ) {
        tokenId = tokenIds[i].valueOf();
        break;
      }
    }
    // Factory Owner Sets Conduit Address
    await poolFactory.setConduitAddress(conduit.address, metadata(owner));

    await conduit.setPoolFactoryAddress(poolFactory.address);
    const signature = await signBidV2WithEIP712(
      bid,
      conduit.address,
      buyerPrivateKey
    ); // buyer signs it
    await token.approve(conduit.address, toEth(price), metadata(buyer)); // Approve tokens

    const prev_pool_balance = await token.balanceOf(pool.address);
    const acceptBidResult = await pool.acceptBid(
      bid,
      signature,
      testNft.address,
      tokenId,
      metadata(lp)
    );
    const after_pool_balance = await token.balanceOf(pool.address);
    const optionId = await pool.getOptionIdForToken(testNft.address, tokenId);

    assert.equal(
      await option.ownerOf(optionId),
      buyer,
      "Buyer not the owner of option"
    );
    assert.equal(
      prev_pool_balance.add(toBN(toEth(price))).toString(),
      after_pool_balance.toString()
    );
  });

  it("Accept Call Bid without tokenId - (only owner)", async () => {
    const price = 1;
    const strikePrice = 10;
    let blockTimestamp = await (
      await web3.eth.getBlock(await web3.eth.getBlockNumber())
    ).timestamp;
    const bid: Bid = {
      id: 3,
      price: toEth(price),
      tokenAddress: token.address,
      collection: testNft.address,
      orderExpiry: Number(blockTimestamp) + 20,
      buyer,
      optionType: OptionType.CALL,
      strikePrice: toEth(strikePrice),
      expiry: Number(blockTimestamp) + 20000,
      expiryAllowance: 0,
      optionTokenAddress: token.address,
    };

    // Factory Owner Sets Conduit Address
    await poolFactory.setConduitAddress(conduit.address, metadata(owner));

    await conduit.setPoolFactoryAddress(poolFactory.address);
    const signature = await signBidV2WithEIP712(
      bid,
      conduit.address,
      buyerPrivateKey
    ); // buyer signs it

    await token.approve(conduit.address, toEth(price), metadata(buyer)); // Approve tokens

    const prev_pool_balance = await token.balanceOf(pool.address);

    const tokenIds = await getAllTokenIds(pool.address, testNft);
    let tokenId = 0;
    for (let i = 0; i < tokenIds.length; i++) {
      if (
        await pool.isAvailableTokenId(testNft.address, tokenIds[i].valueOf())
      ) {
        tokenId = tokenIds[i].valueOf();
        break;
      }
    }
    await pool.acceptBid(
      bid,
      signature,
      testNft.address,
      tokenId,
      metadata(lp)
    );

    const after_pool_balance = await token.balanceOf(pool.address);

    assert.equal(
      prev_pool_balance.add(toBN(toEth(price))).toString(),
      after_pool_balance.toString()
    );
  });

  it("Accept Call Bid without tokenId - (only owner) should be failed if bid already finished or cancelled", async () => {
    const price = 1;
    const strikePrice = 10;
    let blockTimestamp = await (
      await web3.eth.getBlock(await web3.eth.getBlockNumber())
    ).timestamp;
    const bid: Bid = {
      id: 2,
      price: toEth(price),
      tokenAddress: token.address,
      collection: testNft.address,
      orderExpiry: Number(blockTimestamp) + 20,
      buyer,
      optionType: OptionType.CALL,
      strikePrice: toEth(strikePrice),
      expiry: Number(blockTimestamp) + 20000,
      expiryAllowance: 0,
      optionTokenAddress: token.address,
    };

    // Factory Owner Sets Conduit Address
    await poolFactory.setConduitAddress(conduit.address, metadata(owner));

    await conduit.setPoolFactoryAddress(poolFactory.address);
    const signature = await signBidV2WithEIP712(
      bid,
      conduit.address,
      buyerPrivateKey
    ); // buyer signs it

    await token.approve(conduit.address, toEth(price), metadata(buyer)); // Approve tokens

    const tokenIds = await getAllTokenIds(pool.address, testNft);
    let tokenId = 0;
    for (let i = 0; i < tokenIds.length; i++) {
      if (
        await pool.isAvailableTokenId(testNft.address, tokenIds[i].valueOf())
      ) {
        tokenId = tokenIds[i].valueOf();
        break;
      }
    }
    await truffleAssert.reverts(
      pool.acceptBid(bid, signature, testNft.address, tokenId, metadata(lp)),
      "Order was finalized or cancelled"
    );
  });

  it("Accept Call Bid with invalid tokenId - (only owner)", async () => {
    const price = 1;
    const strikePrice = 10;
    let blockTimestamp = await (
      await web3.eth.getBlock(await web3.eth.getBlockNumber())
    ).timestamp;
    const bid: Bid = {
      id: 10,
      price: toEth(price),
      tokenAddress: token.address,
      collection: testNft.address,
      orderExpiry: Number(blockTimestamp) + 20,
      buyer,
      optionType: OptionType.CALL,
      strikePrice: toEth(strikePrice),
      expiry: Number(blockTimestamp) + 20000,
      expiryAllowance: 0,
      optionTokenAddress: token.address,
    };

    // Factory Owner Sets Conduit Address
    await poolFactory.setConduitAddress(conduit.address, metadata(owner));
    await conduit.setPoolFactoryAddress(poolFactory.address);
    const signature = await signBidV2WithEIP712(
      bid,
      conduit.address,
      buyerPrivateKey
    ); // buyer signs it

    await expectRevertCustomError(
      pool.acceptBid(bid, signature, testNft.address, 1001, metadata(lp)),
      "NftIsInvalid"
    );
  });

  it("Accept Call Bid with not owner - (only owner)", async () => {
    const price = 1;
    const strikePrice = 10;
    let blockTimestamp = await (
      await web3.eth.getBlock(await web3.eth.getBlockNumber())
    ).timestamp;
    const bid: Bid = {
      id: 2,
      price: toEth(price),
      tokenAddress: token.address,
      collection: testNft.address,
      orderExpiry: Number(blockTimestamp) + 20,
      buyer,
      optionType: OptionType.CALL,
      strikePrice: toEth(strikePrice),
      expiry: Number(blockTimestamp) + 20000,
      expiryAllowance: 0,
      optionTokenAddress: token.address,
    };

    let tokenId = 0;

    const signature = await signBidV2WithEIP712(
      bid,
      conduit.address,
      buyerPrivateKey
    ); // buyer signs it
    await truffleAssert.reverts(
      pool.acceptBid(bid, signature, testNft.address, tokenId, metadata(buyer)),
      "Ownable: caller is not the owner"
    );
  });
});

contract("ERC20WasabiPoolV2: Accept Pool Bid", (accounts) => {
  let token: DemoETHInstance;
  let poolFactory: WasabiPoolFactoryV2Instance;
  let option: WasabiOptionInstance;
  let testNft: TestERC721Instance;
  let poolAddress: string;
  let pool: ERC20WasabiPoolV2Instance;
  let callOptionId: BN;
  let putOptionId: BN;
  let request: PoolAskV2;

  const lp = accounts[2];
  const buyer = accounts[3];
  const someoneElse = accounts[5];

  const lpPrivateKey =
    "0dbbe8e4ae425a6d2687f1a7e3ba17bc98c673636790f1b8ad91193c05875ef1";
  const buyerPrivateKey =
    "c88b703fb08cbea894b6aeff5a544fb92e78a18e19814cd85da83b71f772aa6c";

  const duration = 10000;
  const premium = 1;
  const strike = 10;

  var signature;

  before("Prepare State", async function () {
    token = await DemoETH.deployed();
    testNft = await TestERC721.deployed();
    option = await WasabiOption.deployed();
    poolFactory = await WasabiPoolFactoryV2.deployed();
    await option.toggleFactory(poolFactory.address, true);

    await token.mint(metadata(lp));
    await token.mint(metadata(buyer));

    await testNft.mint(metadata(lp));
    await testNft.mint(metadata(lp));
    await testNft.mint(metadata(lp));
    await testNft.mint(metadata(buyer));
    await testNft.mint(metadata(buyer));
    await testNft.mint(metadata(buyer));
  });

  it("Create Pool", async () => {
    await testNft.setApprovalForAll.sendTransaction(
      poolFactory.address,
      true,
      metadata(lp)
    );

    const initialPoolBalance = toEth(10);
    await token.approve(poolFactory.address, initialPoolBalance, metadata(lp));
    const createPoolResult = await poolFactory.createERC20Pool(
      token.address,
      initialPoolBalance,
      [testNft.address, testNft.address, testNft.address],
      [1001, 1002, 1003],
      ZERO_ADDRESS,
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
    pool = await ERC20WasabiPoolV2.at(poolAddress);
    assert.equal(await pool.owner(), lp, "Pool creator and owner not same");
    assert.deepEqual(
      await getAllTokenIds(pool.address, testNft),
      [1001, 1002, 1003],
      "Pool doesn't have the correct tokens"
    );

    assert.equal(
      await pool.getLiquidityAddress(),
      token.address,
      "Token not correct"
    );
  });

  it("Write Option (only owner)", async () => {
    let blockNumber = await web3.eth.getBlockNumber();
    let timestamp = Number((await web3.eth.getBlock(blockNumber)).timestamp);
    let expiry = timestamp + duration;
    let orderExpiry = timestamp + duration;

    await token.approve(pool.address, toEth(premium * 2), metadata(buyer));

    // Write CALL and validate
    request = makeV2Request(
      0,
      pool.address,
      OptionType.CALL,
      strike,
      premium,
      expiry,
      testNft.address,
      1001,
      orderExpiry
    );
    signature = await signPoolAskV2WithEIP712(
      request,
      pool.address,
      lpPrivateKey
    );
    const callWriteOptionResult = await pool.writeOption(
      request,
      signature,
      metadata(buyer)
    );
    truffleAssert.eventEmitted(
      callWriteOptionResult,
      "OptionIssued",
      null,
      "Asset wasn't locked"
    );
    const callLog = callWriteOptionResult.logs.find(
      (l) => l.event == "OptionIssued"
    )! as Truffle.TransactionLog<OptionIssued>;
    callOptionId = callLog.args.optionId;
    assert.equal(
      await option.ownerOf(callOptionId),
      buyer,
      "Buyer not the owner of option"
    );
    assert.equal(
      (await pool.getOptionIdForToken(request.nft, request.tokenId)).toNumber(),
      callOptionId.toNumber(),
      "Option of token not correct"
    );

    // Write PUT and validate
    request = makeV2Request(
      1,
      pool.address,
      OptionType.PUT,
      strike,
      premium,
      expiry,
      testNft.address,
      1001,
      orderExpiry
    );
    signature = await signPoolAskV2WithEIP712(
      request,
      pool.address,
      lpPrivateKey
    );
    const putWriteOptionResult = await pool.writeOption(
      request,
      signature,
      metadata(buyer)
    );
    truffleAssert.eventEmitted(
      putWriteOptionResult,
      "OptionIssued",
      null,
      "Asset wasn't locked"
    );
    const putLog = putWriteOptionResult.logs.find(
      (l) => l.event == "OptionIssued"
    )! as Truffle.TransactionLog<OptionIssued>;
    putOptionId = putLog.args.optionId;
    assert.equal(
      await option.ownerOf(putOptionId),
      buyer,
      "Buyer not the owner of option"
    );
  });

  it("Accept pool bid CALL (only option holder)", async () => {
    let blockNumber = await web3.eth.getBlockNumber();
    let timestamp = Number((await web3.eth.getBlock(blockNumber)).timestamp);
    let orderExpiry = timestamp - duration;

    let poolBid: PoolBid = {
      id: 1000,
      price: toEth(2),
      tokenAddress: token.address,
      orderExpiry,
      optionId: callOptionId.toString(),
    };

    signature = await signPoolBidV2WithEIP712(
      poolBid,
      pool.address,
      buyerPrivateKey
    );
    await expectRevertCustomError(
      pool.acceptPoolBid(poolBid, signature, metadata(buyer)),
      "InvalidSignature",
      "Order can only be signer by pool creator"
    );

    signature = await signPoolBidV2WithEIP712(
      poolBid,
      pool.address,
      lpPrivateKey
    );
    await expectRevertCustomError(
      pool.acceptPoolBid(poolBid, signature, metadata(buyer)),
      "HasExpired",
      "Expired order cannot be taken"
    );
    orderExpiry = timestamp + duration;

    poolBid.id = 1; // id was used to issue the option
    poolBid.orderExpiry = orderExpiry;
    signature = await signPoolBidV2WithEIP712(
      poolBid,
      pool.address,
      lpPrivateKey
    );
    await expectRevertCustomError(
      pool.acceptPoolBid(poolBid, signature, metadata(buyer)),
      "OrderFilledOrCancelled",
      "Order has already been filled"
    );
    poolBid.id = 1000;

    poolBid.optionId = 99;
    signature = await signPoolBidV2WithEIP712(
      poolBid,
      pool.address,
      lpPrivateKey
    );
    await expectRevertCustomError(
      pool.acceptPoolBid(poolBid, signature, metadata(buyer)),
      "HasExpired",
      "Invalid or expired option"
    );
    poolBid.optionId = callOptionId.toString();

    signature = await signPoolBidV2WithEIP712(
      poolBid,
      pool.address,
      lpPrivateKey
    );
    await expectRevertCustomError(
      pool.acceptPoolBid(poolBid, signature, metadata(someoneElse)),
      "Unauthorized",
      "Only owner can accept bid"
    );

    let availableBalance = await pool.availableBalance();
    poolBid.price = availableBalance.add(toBN(toEth(1))).toString();
    signature = await signPoolBidV2WithEIP712(
      poolBid,
      pool.address,
      lpPrivateKey
    );
    await expectRevertCustomError(
      pool.acceptPoolBid(poolBid, signature, metadata(buyer)),
      "InsufficientAvailableLiquidity",
      "Not enough liquidity"
    );
    poolBid.price = availableBalance.toString();

    signature = await signPoolBidV2WithEIP712(
      poolBid,
      pool.address,
      lpPrivateKey
    );
    const poolBidTakenResult = await pool.acceptPoolBid(
      poolBid,
      signature,
      metadata(buyer)
    );

    await truffleAssert.reverts(
      option.ownerOf(poolBid.optionId),
      "ERC721: invalid token ID",
      "Option wasn't burned"
    );
    availableBalance = await pool.availableBalance();
    assert.equal(
      availableBalance.toNumber(),
      0,
      "Not enough was used to buy option"
    );

    truffleAssert.eventEmitted(
      poolBidTakenResult,
      "PoolBidTaken",
      null,
      "bid wasn't taken"
    );
  });

  it("Accept pool bid PUT (only option holder)", async () => {
    let blockNumber = await web3.eth.getBlockNumber();
    let timestamp = Number((await web3.eth.getBlock(blockNumber)).timestamp);
    let orderExpiry = timestamp + duration;

    const putStrike = toBN(
      (await pool.getOptionData(putOptionId.toString())).strikePrice
    );

    let poolBid: PoolBid = {
      id: 1001,
      price: putStrike.add(toBN(toEth(1))).toString(),
      tokenAddress: token.address,
      orderExpiry,
      optionId: putOptionId.toString(),
    };

    signature = await signPoolBidV2WithEIP712(
      poolBid,
      pool.address,
      lpPrivateKey
    );
    await expectRevertCustomError(
      pool.acceptPoolBid(poolBid, signature, metadata(buyer)),
      "InsufficientAvailableLiquidity",
      "Not enough liquidity"
    );

    // Can use the eth locked for put option
    poolBid.price = putStrike.toString();
    signature = await signPoolBidV2WithEIP712(
      poolBid,
      pool.address,
      lpPrivateKey
    );
    const poolBidTakenResult = await pool.acceptPoolBid(
      poolBid,
      signature,
      metadata(buyer)
    );

    await truffleAssert.reverts(
      option.ownerOf(poolBid.optionId),
      "ERC721: invalid token ID",
      "Option wasn't burned"
    );

    truffleAssert.eventEmitted(
      poolBidTakenResult,
      "PoolBidTaken",
      null,
      "bid wasn't taken"
    );
  });
});

contract("ERC20WasabiPoolV2: CallOption", (accounts) => {
  let token: DemoETHInstance;
  let poolFactory: WasabiPoolFactoryV2Instance;
  let option: WasabiOptionInstance;
  let testNft: TestERC721Instance;
  let poolAddress: string;
  let pool: ERC20WasabiPoolV2Instance;
  let optionId: BN;
  let request: PoolAskV2;

  const lp = accounts[2];
  const buyer = accounts[3];
  const someoneElse = accounts[5];
  const duration = 10000;

  const lpPrivateKey =
    "0dbbe8e4ae425a6d2687f1a7e3ba17bc98c673636790f1b8ad91193c05875ef1";
  const someoneElsePrivateKey =
    "659cbb0e2411a44db63778987b1e22153c086a95eb6b18bdf89de078917abc63";

  var signature;

  before("Prepare State", async function () {
    token = await DemoETH.deployed();
    testNft = await TestERC721.deployed();
    option = await WasabiOption.deployed();
    poolFactory = await WasabiPoolFactoryV2.deployed();
    await option.toggleFactory(poolFactory.address, true);

    await token.mint(metadata(buyer));

    await testNft.mint(metadata(lp));
    await testNft.mint(metadata(lp));
    await testNft.mint(metadata(lp));
    await testNft.mint(metadata(someoneElse));
    await testNft.mint(metadata(buyer));
    await testNft.mint(metadata(buyer));
  });

  it("Create Pool", async () => {
    assert.equal(
      (await token.balanceOf(buyer)).toString(),
      toEth(100),
      "Not enough minted"
    );

    await testNft.setApprovalForAll.sendTransaction(
      poolFactory.address,
      true,
      metadata(lp)
    );

    const createPoolResult = await poolFactory.createERC20Pool(
      token.address,
      0,
      [testNft.address, testNft.address, testNft.address],
      [1001, 1002, 1003],
      ZERO_ADDRESS,
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
    pool = await ERC20WasabiPoolV2.at(poolAddress);
    assert.equal(await pool.owner(), lp, "Pool creator and owner not same");
    assert.deepEqual(
      await getAllTokenIds(pool.address, testNft),
      [1001, 1002, 1003],
      "Pool doesn't have the correct tokens"
    );

    assert.equal(
      await pool.getLiquidityAddress(),
      token.address,
      "Token not correct"
    );
  });

  it("Validate Option Requests", async () => {
    let id = 1;
    let blockNumber = await web3.eth.getBlockNumber();
    let timestamp = Number((await web3.eth.getBlock(blockNumber)).timestamp);
    let expiry = timestamp + duration;
    let orderExpiry = timestamp + duration;

    const premium = 1;
    const allowed = premium * 2;

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
    ); // no premium in request
    signature = await signPoolAskV2WithEIP712(
      request,
      pool.address,
      lpPrivateKey
    );
    await truffleAssert.reverts(
      pool.writeOption.sendTransaction(request, signature, metadata(buyer)),
      "Not enough premium is supplied",
      "No permission given to transfer enough tokens"
    );

    await token.approve(pool.address, toEth(allowed), metadata(buyer));

    orderExpiry = timestamp - 1000;
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
    ); // no premium in request
    signature = await signPoolAskV2WithEIP712(
      request,
      pool.address,
      lpPrivateKey
    );
    await expectRevertCustomError(
      pool.writeOption(request, signature, metadata(buyer, 1)),
      "HasExpired"
    );

    orderExpiry = timestamp + duration;

    request = makeV2Request(
      id,
      pool.address,
      OptionType.CALL,
      0,
      premium,
      expiry,
      testNft.address,
      1001,
      orderExpiry
    ); // no premium in request
    signature = await signPoolAskV2WithEIP712(
      request,
      pool.address,
      lpPrivateKey
    );
    await expectRevertCustomError(
      pool.writeOption(request, signature, metadata(buyer)),
      "InvalidStrike"
    );

    request = makeV2Request(
      id,
      pool.address,
      OptionType.CALL,
      10,
      0,
      expiry,
      testNft.address,
      1001,
      orderExpiry
    ); // no premium in request

    signature = await signPoolAskV2WithEIP712(
      request,
      pool.address,
      lpPrivateKey
    );
    await truffleAssert.reverts(
      pool.writeOption.sendTransaction(request, signature, metadata(lp)),
      "Not enough premium is supplied",
      "Cannot write option when premium is 0"
    );

    request = makeV2Request(
      id,
      pool.address,
      OptionType.CALL,
      10,
      allowed + 0.1,
      expiry,
      testNft.address,
      1001,
      orderExpiry
    );
    signature = await signPoolAskV2WithEIP712(
      request,
      pool.address,
      lpPrivateKey
    );
    await truffleAssert.reverts(
      pool.writeOption.sendTransaction(request, signature, metadata(buyer)), // not sending enough premium
      "Not enough premium is supplied",
      "Premium paid doesn't match the premium of the request"
    );

    id = 2;
    const request2 = makeV2Request(
      id,
      pool.address,
      OptionType.CALL,
      9,
      premium,
      expiry,
      testNft.address,
      1001,
      orderExpiry
    );
    signature = await signPoolAskV2WithEIP712(
      request2,
      pool.address,
      someoneElsePrivateKey
    );
    await expectRevertCustomError(
      pool.writeOption.sendTransaction(request2, signature, metadata(buyer)),
      "InvalidSignature"
    );

    const emptySignature =
      "0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";
    await expectRevertCustomError(
      pool.writeOption.sendTransaction(
        request,
        emptySignature,
        metadata(buyer)
      ),
      "InvalidSignature"
    );
    signature = await signPoolAskV2WithEIP712(
      request,
      pool.address,
      someoneElsePrivateKey
    );
    await expectRevertCustomError(
      pool.writeOption.sendTransaction(request, signature, metadata(buyer)),
      "InvalidSignature",
      "Must be signed by owner"
    );
    id = 3;
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
  });

  it("Write Option (only owner)", async () => {
    signature = await signPoolAskV2WithEIP712(
      request,
      pool.address,
      lpPrivateKey
    );
    const writeOptionResult = await pool.writeOption(
      request,
      signature,
      metadata(buyer)
    );
    truffleAssert.eventEmitted(
      writeOptionResult,
      "OptionIssued",
      null,
      "Asset wasn't locked"
    );
    assert.equal(
      await token.balanceOf(pool.address),
      request.premium,
      "Incorrect balance in pool"
    );

    const log = writeOptionResult.logs.find(
      (l) => l.event == "OptionIssued"
    )! as Truffle.TransactionLog<OptionIssued>;
    optionId = log.args.optionId;

    assert.equal(
      await option.ownerOf(optionId),
      buyer,
      "Buyer not the owner of option"
    );
    const expectedOptionId = await pool.getOptionIdForToken(
      request.nft,
      request.tokenId
    );
    assert.equal(
      expectedOptionId.toNumber(),
      optionId.toNumber(),
      "Option of token not correct"
    );

    request.id = 4;
    signature = await signPoolAskV2WithEIP712(
      request,
      pool.address,
      lpPrivateKey
    );
    await expectRevertCustomError(
      pool.writeOption.sendTransaction(request, signature, metadata(buyer)),
      "RequestNftIsLocked",
      "Cannot (re)write an option for a locked asset"
    );
  });

  it("Execute Option (only option holder)", async () => {
    await truffleAssert.reverts(
      pool.executeOption.sendTransaction(optionId, metadata(someoneElse)),
      "Only the token owner can execute the option",
      "Non option holder can't execute the option"
    );
    await truffleAssert.reverts(
      pool.executeOption.sendTransaction(optionId, metadata(buyer, 5)),
      "Strike price needs to be supplied to execute a CALL option",
      "Strike price needs to be supplied to execute a CALL option"
    );

    await token.approve(pool.address, request.strikePrice, metadata(buyer));
    const executeOptionResult = await pool.executeOption(
      optionId,
      metadata(buyer)
    );

    const log = executeOptionResult.logs.find(
      (l) => l.event == "OptionExecuted"
    )! as Truffle.TransactionLog<OptionExecuted>;
    const expectedOptionId = log.args.optionId;

    assert.equal(
      expectedOptionId.toString(),
      optionId.toString(),
      "Option wasn't executed"
    );
    assert.equal(
      await testNft.ownerOf(request.tokenId),
      buyer,
      "Option executor didn't get NFT"
    );
    assert.equal(
      (await token.balanceOf(pool.address)).toString(),
      toEth(10 + 1),
      "Incorrect balance in pool"
    );
    await truffleAssert.reverts(
      option.ownerOf(optionId),
      "ERC721: invalid token ID",
      "Option NFT not burned after execution"
    );
  });

  it("Issue Option & Send/Sell Back to Pool", async () => {
    let initialPoolBalance = await token.balanceOf(poolAddress);
    assert.deepEqual(
      await getAllTokenIds(pool.address, testNft),
      [1003, 1002],
      "Pool doesn't have the correct tokens"
    );

    const id = 4;
    let blockNumber = await web3.eth.getBlockNumber();
    let timestamp = Number((await web3.eth.getBlock(blockNumber)).timestamp);
    let expiry = timestamp + duration;
    let orderExpiry = timestamp + duration;

    request = makeV2Request(
      id,
      pool.address,
      OptionType.CALL,
      10,
      1,
      expiry,
      testNft.address,
      1002,
      orderExpiry
    );
    await token.approve(pool.address, request.premium, metadata(buyer));
    signature = await signPoolAskV2WithEIP712(
      request,
      pool.address,
      lpPrivateKey
    );
    const writeOptionResult = await pool.writeOption(
      request,
      signature,
      metadata(buyer)
    );
    truffleAssert.eventEmitted(
      writeOptionResult,
      "OptionIssued",
      null,
      "Asset wasn't locked"
    );
    assert.equal(
      (await token.balanceOf(poolAddress)).toString(),
      initialPoolBalance.add(toBN(request.premium)).toString(),
      "Incorrect balance in pool"
    );

    const issueLog = writeOptionResult.logs.find(
      (l) => l.event == "OptionIssued"
    )! as Truffle.TransactionLog<OptionIssued>;
    const optionId = issueLog.args.optionId;
    assert.equal(
      await option.ownerOf(optionId),
      buyer,
      "Buyer not the owner of option"
    );

    const result = await option.methods[
      "safeTransferFrom(address,address,uint256)"
    ](buyer, pool.address, optionId, metadata(buyer));
    const transferLog = result.logs.filter(
      (l) => l.event === "Transfer"
    )[1] as Truffle.TransactionLog<Transfer>;
    assert.equal(transferLog.args.to, ZERO_ADDRESS, "Token wasn't burned");
    assert.equal(
      transferLog.args.tokenId.toString(),
      optionId.toString(),
      "Incorrect option was burned"
    );
    await truffleAssert.reverts(
      option.ownerOf(optionId),
      "ERC721: invalid token ID",
      "Option NFT not burned after execution"
    );
  });

  it("Cancel Request", async () => {
    assert.deepEqual(
      await getAllTokenIds(pool.address, testNft),
      [1003, 1002],
      "Pool doesn't have the correct tokens"
    );

    const id = 5;
    let blockNumber = await web3.eth.getBlockNumber();
    let timestamp = Number((await web3.eth.getBlock(blockNumber)).timestamp);
    let expiry = timestamp + duration;
    let orderExpiry = timestamp + duration;

    request = makeV2Request(
      id,
      pool.address,
      OptionType.CALL,
      10,
      1,
      expiry,
      testNft.address,
      1002,
      orderExpiry
    );
    await token.approve(pool.address, request.premium, metadata(buyer));
    await expectRevertCustomError(
      pool.cancelOrder(request.id, metadata(buyer)),
      "Unauthorized",
      "OWasabiPool: only admin or owner cancel"
    );
    const cancelPoolAskResult = await pool.cancelOrder(
      request.id,
      metadata(lp)
    );
    truffleAssert.eventEmitted(
      cancelPoolAskResult,
      "OrderCancelled",
      null,
      "Asset wasn't locked"
    );

    signature = await signPoolAskV2WithEIP712(
      request,
      pool.address,
      lpPrivateKey
    );
    await expectRevertCustomError(
      pool.writeOption(request, signature, metadata(buyer)),
      "OrderFilledOrCancelled"
    );
  });

  it("Withdraw ERC721", async () => {
    await expectRevertCustomError(
      pool.withdrawERC721.sendTransaction(
        testNft.address,
        [1001],
        metadata(lp)
      ),
      "NftIsInvalid",
      "Token is locked or is not in the pool"
    );
    await truffleAssert.reverts(
      pool.withdrawERC721.sendTransaction(testNft.address, [1002], {
        from: buyer,
      }),
      "caller is not the owner",
      "Only pool owner can withdraw assets"
    );
    await pool.withdrawERC721.sendTransaction(
      testNft.address,
      [1002, 1003],
      metadata(lp)
    );
    assert.equal(
      await testNft.ownerOf(1002),
      lp,
      "Pool owner didn't receive withdrawn NFT"
    );
    assert.equal(
      await testNft.ownerOf(1003),
      lp,
      "Pool owner didn't receive withdrawn NFT"
    );
  });

  it("Withdraw ETH", async () => {
    const value = toBN(toEth(5));
    await web3.eth.sendTransaction({ from: lp, to: poolAddress, value: value });
    await truffleAssert.reverts(
      pool.withdrawETH(value, metadata(buyer)),
      "caller is not the owner",
      "Only pool owner can withdraw ETH"
    );
    const initialBalance = toBN(await web3.eth.getBalance(lp));
    const withdrawETHResult = await pool.withdrawETH(value, metadata(lp));
    await assertIncreaseInBalance(
      lp,
      initialBalance,
      value.sub(gasOfTxn(withdrawETHResult.receipt))
    );
    assert.equal(
      await web3.eth.getBalance(pool.address),
      "0",
      "Incorrect balance in pool"
    );
  });

  it("Withdraw ERC20", async () => {
    const availablePoolBalance = await pool.availableBalance();
    await truffleAssert.reverts(
      pool.withdrawERC20(token.address, availablePoolBalance, metadata(buyer)),
      "caller is not the owner",
      "Only pool owner can withdraw ETH"
    );

    const initialLpBlanace = await token.balanceOf(lp);
    await pool.withdrawERC20(token.address, availablePoolBalance, metadata(lp));
    const finalLpBlanace = await token.balanceOf(lp);
    assert.equal(
      finalLpBlanace.toString(),
      initialLpBlanace.add(availablePoolBalance).toString(),
      "Not enough withdrawn"
    );
    assert.equal(
      (await pool.availableBalance()).toString(),
      "0",
      "Incorrect balance in pool"
    );
  });
});

contract("Erc20WasabiPool: PutOption", (accounts) => {
  let token: DemoETHInstance;
  let poolFactory: WasabiPoolFactoryV2Instance;
  let option: WasabiOptionInstance;
  let testNft: TestERC721Instance;
  let otherToken: BN;
  let tokenToSell: BN;
  let pool: ERC20WasabiPoolV2Instance;
  let optionId: BN;
  let request: PoolAskV2;

  const lp = accounts[2];
  const buyer = accounts[3];
  const someoneElse = accounts[5];
  const duration = 10000;
  const lpPrivateKey =
    "0dbbe8e4ae425a6d2687f1a7e3ba17bc98c673636790f1b8ad91193c05875ef1";
  const buyerPrivateKey =
    "c88b703fb08cbea894b6aeff5a544fb92e78a18e19814cd85da83b71f772aa6c";

  const initialPoolBalance = 20;
  const strikePrice = 10;
  const premium = 1;
  let signature;

  before("Prepare State", async function () {
    token = await DemoETH.deployed();

    testNft = await TestERC721.deployed();
    option = await WasabiOption.deployed();
    poolFactory = await WasabiPoolFactoryV2.deployed();
    await option.toggleFactory(poolFactory.address, true);

    let mintResult = await testNft.mint(metadata(buyer));
    tokenToSell = mintResult.logs.find((e) => e.event == "Transfer")
      ?.args[2] as BN;

    mintResult = await testNft.mint(metadata(someoneElse));
    otherToken = mintResult.logs.find((e) => e.event == "Transfer")
      ?.args[2] as BN;

    await token.mint(metadata(buyer));
    await token.mint(metadata(lp));
  });

  it("Create Pool", async () => {
    await token.approve(
      poolFactory.address,
      toEth(initialPoolBalance),
      metadata(lp)
    );
    const createPoolResult = await poolFactory.createERC20Pool(
      token.address,
      toBN(toEth(initialPoolBalance)),
      [],
      [],
      ZERO_ADDRESS,
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

    const poolAddress = createPoolResult.logs.find(
      (e) => e.event === "NewPool"
    )!.args[0];
    pool = await ERC20WasabiPoolV2.at(poolAddress);

    assert.equal(await pool.owner(), lp, "Pool creator and owner not same");
    assert.equal(
      (await token.balanceOf(pool.address)).toString(),
      toEth(initialPoolBalance),
      "Incorrect total balance in pool"
    );
    assert.equal(
      (await pool.availableBalance()).toString(),
      toEth(initialPoolBalance),
      "Incorrect available balance in pool"
    );

    assert.equal(
      await pool.getLiquidityAddress(),
      token.address,
      "Token not correct"
    );
  });

  it("Validate option requests", async () => {
    const id = 1;
    let blockNumber = await web3.eth.getBlockNumber();
    let timestamp = Number((await web3.eth.getBlock(blockNumber)).timestamp);
    let expiry = timestamp + duration;
    let orderExpiry = timestamp + duration;

    request = makeV2Request(
      id,
      pool.address,
      OptionType.PUT,
      10,
      premium,
      expiry,
      testNft.address,
      1001,
      orderExpiry
    ); // no premium in request

    signature = await signPoolAskV2WithEIP712(
      request,
      pool.address,
      lpPrivateKey
    );
    await truffleAssert.reverts(
      pool.writeOption.sendTransaction(request, signature, metadata(buyer)),
      "Not enough premium is supplied",
      "No permission given to transfer enough tokens"
    );

    await token.approve(pool.address, toEth(premium), metadata(buyer));

    orderExpiry = timestamp - 1000;
    request = makeV2Request(
      id,
      pool.address,
      OptionType.PUT,
      0,
      premium,
      expiry,
      testNft.address,
      1001,
      orderExpiry
    ); // no strike price in request
    signature = await signPoolAskV2WithEIP712(
      request,
      pool.address,
      lpPrivateKey
    );
    await expectRevertCustomError(
      pool.writeOption(request, signature, metadata(buyer)),
      "HasExpired"
    );

    orderExpiry = timestamp + duration;

    request = makeV2Request(
      id,
      pool.address,
      OptionType.PUT,
      0,
      premium,
      expiry,
      testNft.address,
      0,
      orderExpiry
    ); // no strike price in request
    signature = await signPoolAskV2WithEIP712(
      request,
      pool.address,
      lpPrivateKey
    );
    await expectRevertCustomError(
      pool.writeOption.sendTransaction(request, signature, metadata(buyer)),
      "InvalidStrike"
    );

    request = makeV2Request(
      id,
      pool.address,
      OptionType.PUT,
      strikePrice,
      0,
      expiry,
      testNft.address,
      0,
      orderExpiry
    ); // no premium in request
    signature = await signPoolAskV2WithEIP712(
      request,
      pool.address,
      lpPrivateKey
    );
    await truffleAssert.reverts(
      pool.writeOption.sendTransaction(request, signature, metadata(buyer)),
      "Not enough premium is supplied",
      "Cannot write option when premium is 0"
    );

    request = makeV2Request(
      id,
      pool.address,
      OptionType.PUT,
      initialPoolBalance * 5,
      premium,
      expiry,
      testNft.address,
      0,
      orderExpiry
    ); // strike price too high
    signature = await signPoolAskV2WithEIP712(
      request,
      pool.address,
      lpPrivateKey
    );
    await expectRevertCustomError(
      pool.writeOption.sendTransaction(request, signature, metadata(buyer)),
      "InsufficientAvailableLiquidity",
      "Cannot write option strike price is higher than available balance"
    );

    request = makeV2Request(
      id,
      pool.address,
      OptionType.PUT,
      strikePrice,
      premium * 2,
      expiry,
      testNft.address,
      0,
      orderExpiry
    );

    signature = await signPoolAskV2WithEIP712(
      request,
      pool.address,
      lpPrivateKey
    );
    await truffleAssert.reverts(
      pool.writeOption.sendTransaction(request, signature, metadata(buyer)), // not sending enough premium
      "Not enough premium is supplied",
      "Premium paid doesn't match the premium of the request"
    );

    request = makeV2Request(
      id,
      pool.address,
      OptionType.PUT,
      strikePrice,
      premium,
      expiry,
      testNft.address,
      0,
      orderExpiry
    );

    signature = await signPoolAskV2WithEIP712(
      request,
      pool.address,
      buyerPrivateKey
    );
    await expectRevertCustomError(
      pool.writeOption.sendTransaction(
        request,
        signature,
        metadata(buyer, premium)
      ),
      "InvalidSignature",
      "Only caller or admin can issue options"
    );

    const request2 = makeV2Request(
      id,
      pool.address,
      OptionType.PUT,
      strikePrice,
      0.1,
      expiry,
      testNft.address,
      0,
      orderExpiry
    );
    signature = await signPoolAskV2WithEIP712(
      request2,
      pool.address,
      buyerPrivateKey
    );

    await expectRevertCustomError(
      pool.writeOption.sendTransaction(
        request2,
        signature,
        metadata(buyer, premium)
      ),
      "InvalidSignature",
      "Signed object and provided object are different"
    );
  });

  it("Write Option (only owner)", async () => {
    signature = await signPoolAskV2WithEIP712(
      request,
      pool.address,
      lpPrivateKey
    );
    const writeOptionResult = await pool.writeOption(
      request,
      signature,
      metadata(buyer)
    );
    truffleAssert.eventEmitted(
      writeOptionResult,
      "OptionIssued",
      null,
      "Strike price wasn't locked"
    );

    assert.equal(
      (await token.balanceOf(pool.address)).toString(),
      toEth(initialPoolBalance + premium),
      "Incorrect total balance in pool"
    );
    assert.equal(
      (await pool.availableBalance()).toString(),
      toEth(initialPoolBalance - strikePrice + premium),
      "Incorrect available balance in pool"
    );

    const log = writeOptionResult.logs.find(
      (l) => l.event == "OptionIssued"
    )! as Truffle.TransactionLog<OptionIssued>;
    optionId = log.args.optionId;
    assert.equal(
      await option.ownerOf(optionId),
      buyer,
      "Buyer not the owner of option"
    );
  });

  it("Execute Option (only option holder)", async () => {
    assert.equal(
      await testNft.ownerOf(tokenToSell),
      buyer,
      "MP is not the owner of token to sell"
    );
    await testNft.approve(pool.address, tokenToSell, metadata(buyer));

    await truffleAssert.reverts(
      pool.executeOptionWithSell.sendTransaction(
        optionId,
        testNft.address,
        tokenToSell,
        metadata(someoneElse)
      ),
      "Only the token owner can execute the option",
      "Non option holder can't execute the option"
    );
    await truffleAssert.reverts(
      pool.executeOptionWithSell.sendTransaction(
        optionId,
        testNft.address,
        otherToken,
        metadata(buyer)
      ),
      "Need to own the token to sell in order to execute a PUT option",
      "Cannot execute PUT and sell someone else's asset"
    );

    const initialBuyerBalance = await token.balanceOf(buyer);
    const executeOptionWithSellResult = await pool.executeOptionWithSell(
      optionId,
      testNft.address,
      tokenToSell,
      metadata(buyer)
    );
    const finalBuyerBalance = await token.balanceOf(buyer);
    assert.equal(
      finalBuyerBalance.toString(),
      initialBuyerBalance.add(toBN(request.strikePrice)).toString(),
      "Option buyer didn't get enough"
    );

    const log = executeOptionWithSellResult.logs.find(
      (l) => l.event == "OptionExecuted"
    )! as Truffle.TransactionLog<OptionExecuted>;
    const expectedOptionId = log.args.optionId;
    assert.equal(
      expectedOptionId.toString(),
      optionId.toString(),
      "Option wasn't executed"
    );
    assert.equal(
      (await token.balanceOf(pool.address)).toString(),
      toEth(initialPoolBalance - strikePrice + premium),
      "Incorrect total balance in pool"
    );
    assert.equal(
      (await pool.availableBalance()).toString(),
      toEth(initialPoolBalance - strikePrice + premium),
      "Incorrect available balance in pool"
    );
    assert.equal(
      await testNft.ownerOf(tokenToSell),
      pool.address,
      "Pool didn't get NFT"
    );
    await truffleAssert.reverts(
      option.ownerOf(optionId),
      "ERC721: invalid token ID",
      "Option NFT not burned after execution"
    );
  });

  it("Withdraw ETH", async () => {
    const value = toBN(toEth(5));
    await web3.eth.sendTransaction({
      from: lp,
      to: pool.address,
      value: value,
    });
    await truffleAssert.reverts(
      pool.withdrawETH(value, metadata(buyer)),
      "caller is not the owner",
      "Only pool owner can withdraw ETH"
    );
    const initialBalance = toBN(await web3.eth.getBalance(lp));
    const withdrawETHResult = await pool.withdrawETH(value, metadata(lp));
    await assertIncreaseInBalance(
      lp,
      initialBalance,
      value.sub(gasOfTxn(withdrawETHResult.receipt))
    );
    assert.equal(
      await web3.eth.getBalance(pool.address),
      "0",
      "Incorrect balance in pool"
    );
  });

  it("Withdraw ERC20", async () => {
    const availablePoolBalance = await pool.availableBalance();
    await truffleAssert.reverts(
      pool.withdrawERC20(token.address, availablePoolBalance, metadata(buyer)),
      "caller is not the owner",
      "Only pool owner can withdraw ETH"
    );

    const initialLpBlanace = await token.balanceOf(lp);
    await pool.withdrawERC20(token.address, availablePoolBalance, metadata(lp));
    const finalLpBlanace = await token.balanceOf(lp);
    assert.equal(
      finalLpBlanace.toString(),
      initialLpBlanace.add(availablePoolBalance).toString(),
      "Not enough withdrawn"
    );
    assert.equal(
      (await pool.availableBalance()).toString(),
      "0",
      "Incorrect balance in pool"
    );
  });

  it("Withdraw ERC721", async () => {
    await expectRevertCustomError(
      pool.withdrawERC721.sendTransaction(
        testNft.address,
        [otherToken],
        metadata(lp)
      ),
      "NftIsInvalid"
    );
    await truffleAssert.reverts(
      pool.withdrawERC721.sendTransaction(testNft.address, [tokenToSell], {
        from: buyer,
      }),
      "caller is not the owner",
      "Only pool owner can withdraw assets"
    );
    await pool.withdrawERC721.sendTransaction(
      testNft.address,
      [tokenToSell],
      metadata(lp)
    );
    assert.equal(
      await testNft.ownerOf(tokenToSell),
      lp,
      "Pool owner didn't receive withdrawn NFT"
    );
  });
});

contract("ERC20WasabiPoolV2: Clear Expired Options From Pool", (accounts) => {
  let token: DemoETHInstance;
  let poolFactory: WasabiPoolFactoryV2Instance;
  let conduit: WasabiConduitV2Instance;
  let option: WasabiOptionInstance;
  let testNft: TestERC721Instance;
  let poolAddress: string;
  let pool: ERC20WasabiPoolV2Instance;
  let optionId: BN;
  let request: PoolAskV2;
  let afterRoyaltyPayoutPercent: number;

  const lp = accounts[2];
  const buyer = accounts[3];
  const someoneElse = accounts[5];
  const lpPrivateKey =
    "0dbbe8e4ae425a6d2687f1a7e3ba17bc98c673636790f1b8ad91193c05875ef1";

  before("Prepare State", async function () {
    token = await DemoETH.deployed();
    testNft = await TestERC721.deployed();
    option = await WasabiOption.deployed();
    poolFactory = await WasabiPoolFactoryV2.deployed();
    conduit = await WasabiConduitV2.deployed();
    await option.toggleFactory(poolFactory.address, true);
    await conduit.setOption(option.address);
    await conduit.setPoolFactoryAddress(poolFactory.address);
    poolFactory.setConduitAddress(conduit.address);

    await token.mint(metadata(buyer));
    await token.mint(metadata(lp));

    await testNft.mint(metadata(lp));
    await testNft.mint(metadata(lp));
    await testNft.mint(metadata(lp));
    await testNft.mint(metadata(lp));
    await testNft.mint(metadata(someoneElse));
    await testNft.mint(metadata(buyer));
    await testNft.mint(metadata(buyer));

    afterRoyaltyPayoutPercent = 1;
  });

  it("Create Pool", async () => {
    assert.equal(
      (await token.balanceOf(buyer)).toString(),
      toEth(100),
      "Not enough minted"
    );

    await testNft.setApprovalForAll.sendTransaction(
      poolFactory.address,
      true,
      metadata(lp)
    );

    const createPoolResult = await poolFactory.createERC20Pool(
      token.address,
      0,
      [testNft.address, testNft.address, testNft.address, testNft.address],
      [1001, 1002, 1003, 1004],
      ZERO_ADDRESS,
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
    pool = await ERC20WasabiPoolV2.at(poolAddress);
    assert.equal(await pool.owner(), lp, "Pool creator and owner not same");
    assert.deepEqual(
      await getAllTokenIds(pool.address, testNft),
      [1001, 1002, 1003, 1004],
      "Pool doesn't have the correct tokens"
    );

    assert.equal(
      await pool.getLiquidityAddress(),
      token.address,
      "Token not correct"
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
      1003,
      orderExpiry
    );

    await token.approve(conduit.address, toEth(premium * 10), metadata(buyer));

    let signature = await signPoolAskV2WithEIP712(
      request,
      pool.address,
      lpPrivateKey
    );
    optionId = await conduit.buyOption.call(
      request,
      signature,
      metadata(buyer)
    );
    await conduit.buyOption(request, signature, metadata(buyer));

    request = makeV2Request(
      id + 1,
      pool.address,
      OptionType.CALL,
      10,
      premium,
      expiry,
      testNft.address,
      1004,
      orderExpiry
    );

    await token.approve(conduit.address, toEth(premium * 10), metadata(buyer));

    signature = await signPoolAskV2WithEIP712(
      request,
      pool.address,
      lpPrivateKey
    );
    optionId = await conduit.buyOption.call(
      request,
      signature,
      metadata(buyer)
    );
    await conduit.buyOption(request, signature, metadata(buyer));

    request = makeV2Request(
      id + 2,
      pool.address,
      OptionType.CALL,
      10,
      premium,
      expiry,
      testNft.address,
      1001,
      orderExpiry
    );

    await token.approve(conduit.address, toEth(premium * 10), metadata(buyer));

    signature = await signPoolAskV2WithEIP712(
      request,
      pool.address,
      lpPrivateKey
    );
    optionId = await conduit.buyOption.call(
      request,
      signature,
      metadata(buyer)
    );
    await conduit.buyOption(request, signature, metadata(buyer));

    request = makeV2Request(
      id + 3,
      pool.address,
      OptionType.CALL,
      10,
      premium,
      expiry,
      testNft.address,
      1002,
      orderExpiry
    );
    await token.approve(conduit.address, toEth(premium * 10), metadata(buyer));
    signature = await signPoolAskV2WithEIP712(
      request,
      pool.address,
      lpPrivateKey
    );
    optionId = await conduit.buyOption.call(
      request,
      signature,
      metadata(buyer)
    );
    await conduit.buyOption(request, signature, metadata(buyer));

    await token.approve(pool.address, toEth(10), metadata(buyer));
    await pool.executeOption(optionId, metadata(buyer));
  });

  it("Clear Expired Options", async () => {
    await advanceTime(10000 * 2);
    await advanceBlock();

    await pool.clearExpiredOptions([2]);

    assert.deepEqual(
      (await pool.getOptionIds()).map((a) => a.toNumber()),
      [1, 3],
      "Pool doesn't have the correct optionIds"
    );

    await pool.clearExpiredOptions([]);

    assert.deepEqual(
      (await pool.getOptionIds()).map((a) => a.toNumber()),
      [],
      "Pool doesn't have the correct optionIds"
    );
  });
});

contract("ERC20WasabiPoolV2: Toggle Pool State", (accounts) => {
  let token: DemoETHInstance;
  let poolFactory: WasabiPoolFactoryV2Instance;
  let conduit: WasabiConduitV2Instance;
  let option: WasabiOptionInstance;
  let testNft: TestERC721Instance;
  let poolAddress: string;
  let pool: ERC20WasabiPoolV2Instance;
  let optionId: BN;
  let request: PoolAskV2;

  const owner = accounts[0];
  const lp = accounts[2];
  const buyer = accounts[3];
  const someoneElse = accounts[5];
  const lpPrivateKey =
    "0dbbe8e4ae425a6d2687f1a7e3ba17bc98c673636790f1b8ad91193c05875ef1";

  before("Prepare State", async function () {
    token = await DemoETH.deployed();
    testNft = await TestERC721.deployed();
    option = await WasabiOption.deployed();
    poolFactory = await WasabiPoolFactoryV2.deployed();
    conduit = await WasabiConduitV2.deployed();
    await option.toggleFactory(poolFactory.address, true);
    await conduit.setOption(option.address);
    await conduit.setPoolFactoryAddress(poolFactory.address);
    poolFactory.setConduitAddress(conduit.address);

    await token.mint(metadata(buyer));
    await token.mint(metadata(lp));

    await testNft.mint(metadata(lp));
    await testNft.mint(metadata(lp));
    await testNft.mint(metadata(lp));
    await testNft.mint(metadata(lp));
    await testNft.mint(metadata(someoneElse));
    await testNft.mint(metadata(buyer));
    await testNft.mint(metadata(buyer));
  });

  it("Create Pool", async () => {
    assert.equal(
      (await token.balanceOf(buyer)).toString(),
      toEth(100),
      "Not enough minted"
    );

    await testNft.setApprovalForAll.sendTransaction(
      poolFactory.address,
      true,
      metadata(lp)
    );

    const createPoolResult = await poolFactory.createERC20Pool(
      token.address,
      0,
      [testNft.address, testNft.address, testNft.address, testNft.address],
      [1001, 1002, 1003, 1004],
      ZERO_ADDRESS,
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
    pool = await ERC20WasabiPoolV2.at(poolAddress);
    assert.equal(await pool.owner(), lp, "Pool creator and owner not same");
    assert.deepEqual(
      await getAllTokenIds(pool.address, testNft),
      [1001, 1002, 1003, 1004],
      "Pool doesn't have the correct tokens"
    );

    assert.equal(
      await pool.getLiquidityAddress(),
      token.address,
      "Token not correct"
    );
  });

  it("Toggle Pool (only Owner)", async () => {
    await truffleAssert.reverts(
      poolFactory.togglePool(poolAddress, PoolState.ACTIVE, metadata(owner)),
      "Pool is in the same state"
    );
    await truffleAssert.reverts(
      poolFactory.togglePool(poolAddress, PoolState.INVALID, metadata(buyer)),
      "Ownable: caller is not the owner"
    );
    await poolFactory.togglePool(
      poolAddress,
      PoolState.INVALID,
      metadata(owner)
    );
    assert.equal(
      await poolFactory.isValidPool(poolAddress),
      false,
      "Pool is not in correct state"
    );
  });

  it("INVALID Pools Can't Write Option", async () => {
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
      1003,
      orderExpiry
    );

    await token.approve(conduit.address, toEth(premium * 10), metadata(lp));

    let signature = await signPoolAskV2WithEIP712(
      request,
      pool.address,
      lpPrivateKey
    );

    await truffleAssert.reverts(
      conduit.buyOption(request, signature, metadata(lp)),
      "Only valid pools can mint"
    );

    //Activate Pool
    await poolFactory.togglePool(
      poolAddress,
      PoolState.ACTIVE,
      metadata(owner)
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
      1003,
      orderExpiry
    );

    await token.approve(conduit.address, toEth(premium * 10), metadata(lp));

    const prev_pool_balance = await token.balanceOf(pool.address);
    let signature = await signPoolAskV2WithEIP712(
      request,
      pool.address,
      lpPrivateKey
    );
    optionId = await conduit.buyOption.call(request, signature, metadata(lp));
    await conduit.buyOption(request, signature, metadata(lp));

    const after_pool_balance = await token.balanceOf(pool.address);

    assert.equal(
      prev_pool_balance.add(toBN(request.premium)).toString(),
      after_pool_balance.toString()
    );

    assert.equal(
      await option.ownerOf(optionId),
      lp,
      "Buyer not the owner of option"
    );
    const expectedOptionId = await pool.getOptionIdForToken(
      request.nft,
      request.tokenId
    );
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
      conduit.buyOption(request, signature, metadata(lp)),
      "RequestNftIsLocked"
    );
  });
});
