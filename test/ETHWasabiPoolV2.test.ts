const truffleAssert = require("truffle-assertions");

import {
  WasabiPoolFactoryV2Instance,
  WasabiOptionInstance,
  TestERC721Instance,
  ETHWasabiPoolV2Instance,
  WasabiConduitV2Instance,
} from "../types/truffle-contracts";
import { OptionIssued } from "../types/truffle-contracts/IWasabiPool";
import { PoolAskV2, OptionType, ZERO_ADDRESS, Ask } from "./util/TestTypes";
import { OptionExecuted } from "../types/truffle-contracts/ETHWasabiPool.js";
import { Transfer } from "../types/truffle-contracts/ERC721";
import {
  advanceTime,
  assertIncreaseInBalance,
  gasOfTxn,
  makeV2Request,
  metadata,
  toBN,
  toEth,
  signAskV2WithEIP712,
  expectRevertCustomError,
  signPoolAskV2WithEIP712,
  getAllTokenIds,
} from "./util/TestUtils";

const Signing = artifacts.require("Signing");
const WasabiPoolFactoryV2 = artifacts.require("WasabiPoolFactoryV2");
const WasabiConduitV2 = artifacts.require("WasabiConduitV2");
const WasabiOption = artifacts.require("WasabiOption");
const ETHWasabiPoolV2 = artifacts.require("ETHWasabiPoolV2");
const TestERC721 = artifacts.require("TestERC721");

contract("ETHWasabiPoolV2: AcceptAsk", (accounts) => {
  let poolFactory: WasabiPoolFactoryV2Instance;
  let conduit: WasabiConduitV2Instance;
  let option: WasabiOptionInstance;
  let testNft: TestERC721Instance;
  let pool: ETHWasabiPoolV2Instance;
  let optionId: BN | string;
  let request: PoolAskV2;

  const lp = accounts[2];
  const buyer = accounts[3];
  const someoneElse = accounts[5];

  const initialPoolBalance = 10;
  const strikePrice = 10;
  const premium = 1;
  const duration = 86400;
  const buyerPrivateKey =
    "c88b703fb08cbea894b6aeff5a544fb92e78a18e19814cd85da83b71f772aa6c";
  const lpPrivateKey =
    "0dbbe8e4ae425a6d2687f1a7e3ba17bc98c673636790f1b8ad91193c05875ef1";

  before("Prepare State", async function () {
    testNft = await TestERC721.deployed();
    await Signing.deployed();
    option = await WasabiOption.deployed();
    poolFactory = await WasabiPoolFactoryV2.deployed();
    conduit = await WasabiConduitV2.deployed();
    await option.toggleFactory(poolFactory.address, true);
    await conduit.setOption(option.address);
    await conduit.setPoolFactoryAddress(poolFactory.address);
    poolFactory.setConduitAddress(conduit.address);

    let mintResult = await testNft.mint(metadata(buyer));
    mintResult = await testNft.mint(metadata(someoneElse));
  });

  it("Create Pool", async () => {
    const createPoolResult = await poolFactory.createPool(
      [],
      [],
      ZERO_ADDRESS,
      metadata(lp, initialPoolBalance)
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
    pool = await ETHWasabiPoolV2.at(poolAddress);

    assert.equal(await pool.owner(), lp, "Pool creator and owner not same");
    assert.equal(
      await web3.eth.getBalance(pool.address),
      toEth(initialPoolBalance),
      "Incorrect total balance in pool"
    );
    assert.equal(
      (await pool.availableBalance()).toString(),
      toEth(initialPoolBalance),
      "Incorrect available balance in pool"
    );
  });

  it("Write Option (only owner)", async () => {
    const id = 1;
    let blockNumber = await web3.eth.getBlockNumber();
    let timestamp = Number((await web3.eth.getBlock(blockNumber)).timestamp);
    let expiry = timestamp + duration;
    let orderExpiry = timestamp + duration;
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
    const signature = await signPoolAskV2WithEIP712(
      request,
      pool.address,
      lpPrivateKey
    );
    const writeOptionResult = await pool.writeOption(
      request,
      signature,
      metadata(lp, 1)
    );
    truffleAssert.eventEmitted(
      writeOptionResult,
      "OptionIssued",
      null,
      "Asset wasn't locked"
    );
    await assertIncreaseInBalance(
      pool.address,
      toBN(toEth(initialPoolBalance)),
      toBN(request.premium)
    );

    const log = writeOptionResult.logs.find(
      (l) => l.event == "OptionIssued"
    )! as Truffle.TransactionLog<OptionIssued>;
    optionId = log.args.optionId;
    assert.equal(
      await option.ownerOf(optionId),
      lp,
      "Buyer not the owner of option"
    );
  });

  it("Accept ask - should revert if not an owner", async () => {
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
      lpPrivateKey
    );

    await truffleAssert.reverts(
      pool.acceptAsk(ask, signature, metadata(buyer)),
      "Ownable: caller is not the owner"
    );
  });

  it("Accept ask - should revert if pool balance is not enough", async () => {
    const price = 15;
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
      lpPrivateKey
    );

    await expectRevertCustomError(
      pool.acceptAsk(ask, signature, metadata(lp)),
      "InsufficientAvailableLiquidity"
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
      lpPrivateKey
    );

    const initialBalanceSeller = await web3.eth.getBalance(optionOwner);
    const acceptAskResult = await pool.acceptAsk(ask, signature, metadata(lp));
    const finalBalanceSeller = await web3.eth.getBalance(optionOwner);
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
    await assertIncreaseInBalance(
      lp,
      toBN(initialBalanceSeller),
      toBN(Number(ask.price)).sub(gasOfTxn(acceptAskResult.receipt))
    );
  });
});

contract("ETHWasabiPoolV2: Expiring CallOption execution", (accounts) => {
  let poolFactory: WasabiPoolFactoryV2Instance;
  let option: WasabiOptionInstance;
  let testNft: TestERC721Instance;
  let pool: ETHWasabiPoolV2Instance;
  let optionId: BN;
  let request: PoolAskV2;
  let tokenToSell: number;
  let signature;

  const lp = accounts[2];
  const buyer = accounts[3];
  const someoneElse = accounts[5];
  const lpPrivateKey =
    "0dbbe8e4ae425a6d2687f1a7e3ba17bc98c673636790f1b8ad91193c05875ef1";
  const duration = 10000;

  before("Prepare State", async function () {
    testNft = await TestERC721.deployed();
    option = await WasabiOption.deployed();
    poolFactory = await WasabiPoolFactoryV2.deployed();
    await option.toggleFactory(poolFactory.address, true);

    let mintResult = await testNft.mint(metadata(lp));
    tokenToSell = (
      mintResult.logs.find((e) => e.event == "Transfer")?.args[2] as BN
    ).toNumber();
  });

  it("Create Pool", async () => {
    await testNft.setApprovalForAll.sendTransaction(
      poolFactory.address,
      true,
      metadata(lp)
    );

    const createPoolResult = await poolFactory.createPool(
      [testNft.address],
      [tokenToSell],
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

    const poolAddress = createPoolResult.logs.find((e) => e.event == "NewPool")!
      .args[0];
    pool = await ETHWasabiPoolV2.at(poolAddress);
    assert.equal(await pool.owner(), lp, "Pool creator and owner not same");
    assert.deepEqual(
      await getAllTokenIds(pool.address, testNft),
      [tokenToSell],
      "Pool doesn't have the correct tokens"
    );
  });

  it("Write Option (only owner)", async () => {
    const id = 1;
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
      tokenToSell,
      orderExpiry
    );

    signature = await signPoolAskV2WithEIP712(
      request,
      pool.address,
      lpPrivateKey
    );
    const writeOptionResult = await pool.writeOption(
      request,
      signature,
      metadata(buyer, 1)
    );
    truffleAssert.eventEmitted(
      writeOptionResult,
      "OptionIssued",
      null,
      "Asset wasn't locked"
    );
    assert.equal(
      await web3.eth.getBalance(pool.address),
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
  });

  it("Execute Option (option expires)", async () => {
    await advanceTime(duration * 2);
    await truffleAssert.reverts(
      pool.executeOption(optionId, metadata(buyer, 10)),
      undefined,
      "Expired option cannot be exercised"
    );
  });
});

contract("ETHWasabiPoolV2: CallOption (with Admin)", (accounts) => {
  let poolFactory: WasabiPoolFactoryV2Instance;
  let option: WasabiOptionInstance;
  let testNft: TestERC721Instance;
  let poolAddress: string;
  let pool: ETHWasabiPoolV2Instance;
  let optionId: BN;
  let request: PoolAskV2;
  let signature;

  const types = [OptionType.CALL];
  const lp = accounts[2];
  const buyer = accounts[3];
  const admin = accounts[4]; // Dkoda
  const someoneElse = accounts[5];
  const duration = 1000;
  const lpPrivateKey =
    "0dbbe8e4ae425a6d2687f1a7e3ba17bc98c673636790f1b8ad91193c05875ef1";
  const buyerPrivateKey =
    "c88b703fb08cbea894b6aeff5a544fb92e78a18e19814cd85da83b71f772aa6c";
  const adminPrivateKey =
    "388c684f0ba1ef5017716adb5d21a053ea8e90277d0868337519f97bede61418";

  before("Prepare State", async function () {
    testNft = await TestERC721.deployed();
    await Signing.deployed();
    option = await WasabiOption.deployed();
    poolFactory = await WasabiPoolFactoryV2.deployed();
    await option.toggleFactory(poolFactory.address, true);

    await testNft.mint(metadata(lp));
    await testNft.mint(metadata(lp));
    await testNft.mint(metadata(lp));
    await testNft.mint(metadata(someoneElse));
    await testNft.mint(metadata(buyer));
    await testNft.mint(metadata(buyer));
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
    pool = await ETHWasabiPoolV2.at(poolAddress);
    assert.equal(await pool.owner(), lp, "Pool creator and owner not same");
    assert.deepEqual(
      await getAllTokenIds(pool.address, testNft),
      [1001, 1002, 1003],
      "Pool doesn't have the correct tokens"
    );
  });

  it("Set admin", async () => {
    await truffleAssert.reverts(
      pool.setAdmin(admin),
      "caller is not the owner",
      "Only owner can change the admin."
    );
    await truffleAssert.reverts(
      pool.removeAdmin(),
      "caller is not the owner",
      "Only owner can change the admin."
    );
    const setAdminResult = await pool.setAdmin(admin, metadata(lp));
    truffleAssert.eventEmitted(
      setAdminResult,
      "AdminChanged",
      { admin: admin },
      "Admin wasn't changed"
    );
  });

  it("Validate Option Requests", async () => {
    let id = 1;
    let blockNumber = await web3.eth.getBlockNumber();
    let timestamp = Number((await web3.eth.getBlock(blockNumber)).timestamp);
    let expiry = timestamp + duration;
    let orderExpiry = timestamp - 1000;

    request = makeV2Request(
      id,
      pool.address,
      OptionType.CALL,
      0,
      1,
      expiry,
      testNft.address,
      1001,
      orderExpiry
    ); // no strike price in request
    signature = await signPoolAskV2WithEIP712(
      request,
      pool.address,
      adminPrivateKey
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
      1,
      expiry,
      testNft.address,
      1001,
      orderExpiry
    ); // no strike price in request
    signature = await signPoolAskV2WithEIP712(
      request,
      pool.address,
      adminPrivateKey
    );
    await expectRevertCustomError(
      pool.writeOption(request, signature, metadata(buyer, 1)),
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
      adminPrivateKey
    );
    await truffleAssert.reverts(
      pool.writeOption.sendTransaction(request, signature, metadata(buyer)),
      "Not enough premium is supplied",
      "Cannot write option when premium is 0"
    );

    request = makeV2Request(
      id,
      pool.address,
      OptionType.CALL,
      10,
      1,
      expiry,
      testNft.address,
      1001,
      orderExpiry
    );
    signature = await signPoolAskV2WithEIP712(
      request,
      pool.address,
      adminPrivateKey
    );
    await truffleAssert.reverts(
      pool.writeOption.sendTransaction(
        request,
        signature,
        metadata(buyer, 0.5)
      ), // not sending enough premium
      "Not enough premium is supplied",
      "Premium paid doesn't match the premium of the request"
    );

    id = 2;
    const request2 = makeV2Request(
      id,
      pool.address,
      OptionType.CALL,
      9,
      1,
      expiry,
      testNft.address,
      1001,
      orderExpiry
    );
    signature = await signPoolAskV2WithEIP712(
      request2,
      pool.address,
      buyerPrivateKey
    );
    await expectRevertCustomError(
      pool.writeOption.sendTransaction(request, signature, metadata(buyer, 1)),
      "InvalidSignature",
      "Signed object and provided object are different"
    );
  });

  it("Write Option (only owner)", async () => {
    signature = await signPoolAskV2WithEIP712(
      request,
      pool.address,
      adminPrivateKey
    );
    const writeOptionResult = await pool.writeOption(
      request,
      signature,
      metadata(buyer, 1)
    );
    truffleAssert.eventEmitted(
      writeOptionResult,
      "OptionIssued",
      null,
      "Asset wasn't locked"
    );
    assert.equal(
      await web3.eth.getBalance(pool.address),
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

    request.id = 2;
    signature = await signPoolAskV2WithEIP712(
      request,
      pool.address,
      adminPrivateKey
    );
    await expectRevertCustomError(
      pool.writeOption.sendTransaction(request, signature, metadata(buyer, 1)),
      "RequestNftIsLocked",
      "Cannot (re)write an option for a locked asset"
    );
  });

  it("Execute Option (only option holder)", async () => {
    await truffleAssert.reverts(
      pool.executeOption.sendTransaction(optionId, metadata(someoneElse, 10)),
      "Only the token owner can execute the option",
      "Non option holder can't execute the option"
    );
    await truffleAssert.reverts(
      pool.executeOption.sendTransaction(optionId, metadata(buyer, 5)),
      "Strike price needs to be supplied to execute a CALL option",
      "Strike price needs to be supplied to execute a CALL option"
    );
    const executeOptionResult = await pool.executeOption(
      optionId,
      metadata(buyer, 10)
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
      await web3.eth.getBalance(pool.address),
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
    let initialPoolBalance = toBN(await web3.eth.getBalance(pool.address));
    assert.deepEqual(
      await getAllTokenIds(pool.address, testNft),
      [1003, 1002],
      "Pool doesn't have the correct tokens"
    );

    const id = 3;
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
    signature = await signPoolAskV2WithEIP712(
      request,
      pool.address,
      adminPrivateKey
    );
    const writeOptionResult = await pool.writeOption(
      request,
      signature,
      metadata(buyer, 1)
    );
    truffleAssert.eventEmitted(
      writeOptionResult,
      "OptionIssued",
      null,
      "Asset wasn't locked"
    );
    assert.equal(
      await web3.eth.getBalance(pool.address),
      initialPoolBalance.add(toBN(request.premium)).toString(),
      "Incorrect balance in pool"
    );

    const log = writeOptionResult.logs.find(
      (l) => l.event == "OptionIssued"
    )! as Truffle.TransactionLog<OptionIssued>;
    const optionId = log.args.optionId;
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
      pool.withdrawERC721.sendTransaction(
        testNft.address,
        [1002],
        metadata(admin)
      ),
      "caller is not the owner",
      "Admin cannot withdraw ERC721"
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
    const availablePoolBalance = await pool.availableBalance();
    await truffleAssert.reverts(
      pool.withdrawETH.sendTransaction(availablePoolBalance, metadata(admin)),
      "caller is not the owner",
      "Admin cannot withdraw ETH"
    );
    const initialBalance = toBN(await web3.eth.getBalance(lp));
    const withdrawETHResult = await pool.withdrawETH(
      availablePoolBalance,
      metadata(lp)
    );
    await assertIncreaseInBalance(
      lp,
      initialBalance,
      availablePoolBalance.sub(gasOfTxn(withdrawETHResult.receipt))
    );
    assert.equal(
      await web3.eth.getBalance(pool.address),
      "0",
      "Incorrect balance in pool"
    );
  });
});

contract("ETHWasabiPoolV2: CallOption", (accounts) => {
  let poolFactory: WasabiPoolFactoryV2Instance;
  let option: WasabiOptionInstance;
  let testNft: TestERC721Instance;
  let poolAddress: string;
  let pool: ETHWasabiPoolV2Instance;
  let optionId: BN;
  let request: PoolAskV2;

  const lp = accounts[2];
  const buyer = accounts[3];
  const someoneElse = accounts[5];
  const lpPrivateKey =
    "0dbbe8e4ae425a6d2687f1a7e3ba17bc98c673636790f1b8ad91193c05875ef1";
  const someoneElsePrivateKey =
    "659cbb0e2411a44db63778987b1e22153c086a95eb6b18bdf89de078917abc63";
  const duration = 1000;

  let signature;

  before("Prepare State", async function () {
    testNft = await TestERC721.deployed();
    await Signing.deployed();
    option = await WasabiOption.deployed();
    poolFactory = await WasabiPoolFactoryV2.deployed();
    await option.toggleFactory(poolFactory.address, true);

    await testNft.mint(metadata(lp));
    await testNft.mint(metadata(lp));
    await testNft.mint(metadata(lp));
    await testNft.mint(metadata(someoneElse));
    await testNft.mint(metadata(buyer));
    await testNft.mint(metadata(buyer));
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
    pool = await ETHWasabiPoolV2.at(poolAddress);
    assert.equal(await pool.owner(), lp, "Pool creator and owner not same");
    assert.deepEqual(
      await getAllTokenIds(pool.address, testNft),
      [1001, 1002, 1003],
      "Pool doesn't have the correct tokens"
    );
  });

  it("Validate Option Requests", async () => {
    const id = 1;
    let blockNumber = await web3.eth.getBlockNumber();
    let timestamp = Number((await web3.eth.getBlock(blockNumber)).timestamp);
    let expiry = timestamp + duration;
    let orderExpiry = timestamp - 1000;

    request = makeV2Request(
      id,
      pool.address,
      OptionType.CALL,
      0,
      1,
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
      pool.writeOption(request, signature, metadata(buyer, 1)),
      "HasExpired"
    );

    orderExpiry = timestamp + duration;

    request = makeV2Request(
      id,
      pool.address,
      OptionType.CALL,
      0,
      1,
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
      pool.writeOption(request, signature, metadata(buyer, 1)),
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
      pool.writeOption.sendTransaction(request, signature, metadata(buyer)),
      "Not enough premium is supplied",
      "Cannot write option when premium is 0"
    );

    request = makeV2Request(
      id,
      pool.address,
      OptionType.CALL,
      10,
      1,
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
      pool.writeOption.sendTransaction(
        request,
        signature,
        metadata(buyer, 0.5)
      ), // not sending enough premium
      "Not enough premium is supplied",
      "Premium paid doesn't match the premium of the request"
    );

    const request2 = makeV2Request(
      id + 1,
      pool.address,
      OptionType.CALL,
      9,
      1,
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
      pool.writeOption.sendTransaction(request, signature, metadata(buyer, 1)),
      "InvalidSignature",
      "Signed object and provided object are different"
    );

    const emptySignature =
      "0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";
    await expectRevertCustomError(
      pool.writeOption.sendTransaction(
        request,
        emptySignature,
        metadata(buyer, 1)
      ),
      "InvalidSignature",
      "Invalid signature"
    );

    signature = await signPoolAskV2WithEIP712(
      request,
      pool.address,
      someoneElsePrivateKey
    );
    await expectRevertCustomError(
      pool.writeOption.sendTransaction(request, signature, metadata(buyer, 1)),
      "InvalidSignature",
      "Must be signed by owner"
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
      metadata(buyer, 1)
    );
    truffleAssert.eventEmitted(
      writeOptionResult,
      "OptionIssued",
      null,
      "Asset wasn't locked"
    );
    assert.equal(
      await web3.eth.getBalance(pool.address),
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

    request.id = request.id + 1;

    signature = await signPoolAskV2WithEIP712(
      request,
      pool.address,
      lpPrivateKey
    );
    await expectRevertCustomError(
      pool.writeOption.sendTransaction(request, signature, metadata(buyer, 1)),
      "RequestNftIsLocked",
      "Cannot (re)write an option for a locked asset"
    );
  });

  it("Burn option (only pool)", async () => {
    await truffleAssert.reverts(
      option.burn(optionId, metadata(buyer)),
      "Caller can't burn option"
    );
  });

  it("Execute Option (only option holder)", async () => {
    await truffleAssert.reverts(
      pool.executeOption.sendTransaction(optionId, metadata(someoneElse, 10)),
      "Only the token owner can execute the option",
      "Non option holder can't execute the option"
    );
    await truffleAssert.reverts(
      pool.executeOption.sendTransaction(optionId, metadata(buyer, 5)),
      "Strike price needs to be supplied to execute a CALL option",
      "Strike price needs to be supplied to execute a CALL option"
    );
    const executeOptionResult = await pool.executeOption(
      optionId,
      metadata(buyer, 10)
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
      await web3.eth.getBalance(pool.address),
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
    let initialPoolBalance = toBN(await web3.eth.getBalance(pool.address));
    assert.deepEqual(
      await getAllTokenIds(pool.address, testNft),
      [1003, 1002],
      "Pool doesn't have the correct tokens"
    );

    let blockNumber = await web3.eth.getBlockNumber();
    let timestamp = Number((await web3.eth.getBlock(blockNumber)).timestamp);
    let expiry = timestamp + duration;
    let orderExpiry = timestamp + duration;
    request = makeV2Request(
      request.id + 1,
      pool.address,
      OptionType.CALL,
      10,
      1,
      expiry,
      testNft.address,
      1002,
      orderExpiry
    );

    signature = await signPoolAskV2WithEIP712(
      request,
      pool.address,
      lpPrivateKey
    );
    const writeOptionResult = await pool.writeOption(
      request,
      signature,
      metadata(buyer, 1)
    );
    truffleAssert.eventEmitted(
      writeOptionResult,
      "OptionIssued",
      null,
      "Asset wasn't locked"
    );
    assert.equal(
      await web3.eth.getBalance(pool.address),
      initialPoolBalance.add(toBN(request.premium)).toString(),
      "Incorrect balance in pool"
    );

    const log = writeOptionResult.logs.find(
      (l) => l.event == "OptionIssued"
    )! as Truffle.TransactionLog<OptionIssued>;
    const optionId = log.args.optionId;
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
    const availablePoolBalance = await pool.availableBalance();
    await truffleAssert.reverts(
      pool.withdrawETH(availablePoolBalance, metadata(buyer)),
      "caller is not the owner",
      "Only pool owner can withdraw ETH"
    );
    const initialBalance = toBN(await web3.eth.getBalance(lp));
    const withdrawETHResult = await pool.withdrawETH(
      availablePoolBalance,
      metadata(lp)
    );
    await assertIncreaseInBalance(
      lp,
      initialBalance,
      availablePoolBalance.sub(gasOfTxn(withdrawETHResult.receipt))
    );
    assert.equal(
      await web3.eth.getBalance(pool.address),
      "0",
      "Incorrect balance in pool"
    );
  });
});

contract("ETHWasabiPoolV2: Expiring PutOption execution", (accounts) => {
  let poolFactory: WasabiPoolFactoryV2Instance;
  let option: WasabiOptionInstance;
  let testNft: TestERC721Instance;
  let otherToken: BN;
  let tokenToSell: BN;
  let pool: ETHWasabiPoolV2Instance;
  let optionId: BN | string;
  let request: PoolAskV2;

  const lp = accounts[2];
  const buyer = accounts[3];
  const someoneElse = accounts[5];
  const lpPrivateKey =
    "0dbbe8e4ae425a6d2687f1a7e3ba17bc98c673636790f1b8ad91193c05875ef1";

  const initialPoolBalance = 20;
  const strikePrice = 10;
  const premium = 1;
  const duration = 86400;

  before("Prepare State", async function () {
    testNft = await TestERC721.deployed();
    await Signing.deployed();
    option = await WasabiOption.deployed();
    poolFactory = await WasabiPoolFactoryV2.deployed();
    await option.toggleFactory(poolFactory.address, true);

    let mintResult = await testNft.mint(metadata(buyer));
    tokenToSell = mintResult.logs.find((e) => e.event == "Transfer")
      ?.args[2] as BN;

    mintResult = await testNft.mint(metadata(someoneElse));
    otherToken = mintResult.logs.find((e) => e.event == "Transfer")
      ?.args[2] as BN;
  });

  it("Create Pool", async () => {
    const createPoolResult = await poolFactory.createPool(
      [],
      [],
      ZERO_ADDRESS,
      metadata(lp, initialPoolBalance)
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
    pool = await ETHWasabiPoolV2.at(poolAddress);

    assert.equal(await pool.owner(), lp, "Pool creator and owner not same");
    assert.equal(
      await web3.eth.getBalance(pool.address),
      toEth(initialPoolBalance),
      "Incorrect total balance in pool"
    );
    assert.equal(
      (await pool.availableBalance()).toString(),
      toEth(initialPoolBalance),
      "Incorrect available balance in pool"
    );
  });

  it("Write Option (only owner)", async () => {
    const id = 1;
    let blockNumber = await web3.eth.getBlockNumber();
    let timestamp = Number((await web3.eth.getBlock(blockNumber)).timestamp);
    let expiry = timestamp + duration;
    let orderExpiry = timestamp + duration;
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
    const signature = await signPoolAskV2WithEIP712(
      request,
      pool.address,
      lpPrivateKey
    );
    const writeOptionResult = await pool.writeOption(
      request,
      signature,
      metadata(buyer, 1)
    );
    truffleAssert.eventEmitted(
      writeOptionResult,
      "OptionIssued",
      null,
      "Asset wasn't locked"
    );
    await assertIncreaseInBalance(
      pool.address,
      toBN(toEth(initialPoolBalance)),
      toBN(request.premium)
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

  it("Execute Option (option expires)", async () => {
    const availableBalanceBeforeExpiration = await pool.availableBalance();

    await testNft.approve(pool.address, tokenToSell, metadata(buyer));
    await advanceTime(duration * 2);
    await truffleAssert.reverts(
      pool.executeOptionWithSell(
        optionId,
        testNft.address,
        tokenToSell,
        metadata(buyer)
      ),
      undefined,
      "Expired option cannot be exercised"
    );

    const availableBalanceAfterExpiration = await pool.availableBalance();
    assert.equal(
      availableBalanceAfterExpiration.toString(),
      availableBalanceBeforeExpiration
        .add(toBN(request.strikePrice))
        .toString(),
      "Available balance didn't increase after expiration"
    );
  });

  it("Withdraw ETH", async () => {
    const lpInitialBalance = toBN(await web3.eth.getBalance(lp));
    const availableBalance = await pool.availableBalance();

    await truffleAssert.reverts(
      pool.withdrawETH(availableBalance, metadata(buyer)),
      "caller is not the owner",
      "Only pool owner can withdraw ETH"
    );
    const withdrawETHResult = await pool.withdrawETH(
      availableBalance,
      metadata(lp)
    );
    await assertIncreaseInBalance(
      lp,
      lpInitialBalance,
      toBN(availableBalance).sub(gasOfTxn(withdrawETHResult.receipt))
    );
    assert.equal(
      await web3.eth.getBalance(pool.address),
      "0",
      "Incorrect balance in pool"
    );

    await expectRevertCustomError(
      pool.withdrawETH(availableBalance, metadata(lp)),
      "InsufficientAvailableLiquidity",
      "Cannot withdraw ETH if there is none"
    );
  });
});

contract("ETHWasabiPoolV2: PutOption", (accounts) => {
  let poolFactory: WasabiPoolFactoryV2Instance;
  let option: WasabiOptionInstance;
  let testNft: TestERC721Instance;
  let otherToken: BN;
  let tokenToSell: BN;
  let pool: ETHWasabiPoolV2Instance;
  let optionId: BN;
  let request: PoolAskV2;

  const lp = accounts[2];
  const buyer = accounts[3];
  const someoneElse = accounts[5];
  const lpPrivateKey =
    "0dbbe8e4ae425a6d2687f1a7e3ba17bc98c673636790f1b8ad91193c05875ef1";
  const someoneElsePrivateKey =
    "659cbb0e2411a44db63778987b1e22153c086a95eb6b18bdf89de078917abc63";
  const duration = 10000;

  const initialPoolBalance = 20;
  const strikePrice = 10;
  const premium = 1;

  let signature;

  before("Prepare State", async function () {
    testNft = await TestERC721.deployed();
    await Signing.deployed();
    option = await WasabiOption.deployed();
    poolFactory = await WasabiPoolFactoryV2.deployed();
    await option.toggleFactory(poolFactory.address, true);

    let mintResult = await testNft.mint(metadata(buyer));
    tokenToSell = mintResult.logs.find((e) => e.event == "Transfer")
      ?.args[2] as BN;

    mintResult = await testNft.mint(metadata(someoneElse));
    otherToken = mintResult.logs.find((e) => e.event == "Transfer")
      ?.args[2] as BN;
  });

  it("Create Pool", async () => {
    const createPoolResult = await poolFactory.createPool(
      [],
      [],
      ZERO_ADDRESS,
      metadata(lp, initialPoolBalance)
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
    pool = await ETHWasabiPoolV2.at(poolAddress);

    assert.equal(await pool.owner(), lp, "Pool creator and owner not same");
    assert.equal(
      await web3.eth.getBalance(pool.address),
      toEth(initialPoolBalance),
      "Incorrect total balance in pool"
    );
    assert.equal(
      (await pool.availableBalance()).toString(),
      toEth(initialPoolBalance),
      "Incorrect available balance in pool"
    );
  });

  it("Validate option requests", async () => {
    const id = 1;
    let blockNumber = await web3.eth.getBlockNumber();
    let timestamp = Number((await web3.eth.getBlock(blockNumber)).timestamp);
    let expiry = timestamp + duration;
    let orderExpiry = timestamp - 1000;

    request = makeV2Request(
      id,
      pool.address,
      OptionType.CALL,
      0,
      1,
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
      pool.writeOption(request, signature, metadata(buyer, 1)),
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
      pool.writeOption.sendTransaction(
        request,
        signature,
        metadata(buyer, premium)
      ),
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
      pool.writeOption.sendTransaction(
        request,
        signature,
        metadata(buyer, premium)
      ),
      "InsufficientAvailableLiquidity",
      "Cannot write option strike price is higher than available balance"
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
      lpPrivateKey
    );
    await truffleAssert.reverts(
      pool.writeOption.sendTransaction(
        request,
        signature,
        metadata(buyer, premium / 2)
      ), // not sending enough premium
      "Not enough premium is supplied",
      "Premium paid doesn't match the premium of the request"
    );

    signature = await signPoolAskV2WithEIP712(
      request,
      pool.address,
      someoneElsePrivateKey
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
      request,
      pool.address,
      lpPrivateKey
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
      metadata(buyer, premium)
    );
    truffleAssert.eventEmitted(
      writeOptionResult,
      "OptionIssued",
      null,
      "Strike price wasn't locked"
    );

    assert.equal(
      await web3.eth.getBalance(pool.address),
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

    let initialBalance = toBN(await web3.eth.getBalance(buyer));
    const executeOptionWithSellResult = await pool.executeOptionWithSell(
      optionId,
      testNft.address,
      tokenToSell,
      metadata(buyer)
    );
    await assertIncreaseInBalance(
      buyer,
      initialBalance,
      toBN(toEth(strikePrice)).sub(
        gasOfTxn(executeOptionWithSellResult.receipt)
      )
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
      await web3.eth.getBalance(pool.address),
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
    const lpInitialBalance = toBN(await web3.eth.getBalance(lp));
    const availableBalance = await pool.availableBalance();

    await truffleAssert.reverts(
      pool.withdrawETH(availableBalance, metadata(buyer)),
      "caller is not the owner",
      "Only pool owner can withdraw ETH"
    );
    const withdrawETHResult = await pool.withdrawETH(
      availableBalance,
      metadata(lp)
    );
    await assertIncreaseInBalance(
      lp,
      lpInitialBalance,
      toBN(availableBalance).sub(gasOfTxn(withdrawETHResult.receipt))
    );
    assert.equal(
      await web3.eth.getBalance(pool.address),
      "0",
      "Incorrect balance in pool"
    );

    await expectRevertCustomError(
      pool.withdrawETH(availableBalance, metadata(lp)),
      "InsufficientAvailableLiquidity",
      "Cannot withdraw ETH if there is none"
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
