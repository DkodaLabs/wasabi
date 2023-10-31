const truffleAssert = require("truffle-assertions");
const ethers = require("ethers");

import {
  WasabiPoolFactoryInstance,
  WasabiOptionInstance,
  TestERC721Instance,
  WasabiBNPLInstance,
  FlashloanInstance,
  MockMarketplaceInstance,
  MockNFTLendingInstance,
  MockLendingInstance,
  WETH9Instance,
  LendingAddressProviderInstance,
  WasabiConduitInstance,
  WasabiFeeManagerInstance,
} from "../types/truffle-contracts";
import {OptionRolledOver} from "../types/truffle-contracts/WasabiBNPL";
import { Ask, Bid, OptionData, PoolState, ZERO_ADDRESS } from "./util/TestTypes";
import {
  signFunctionCallData,
  metadata,
  toEth,
  advanceTime,
  advanceBlock,
  takeSnapshot,
  revert,
  expectRevertCustomError,
  signAskWithEIP712,
  toBN,
  fromWei,
  gasOfTxn,
  signBidWithEIP712,
} from "./util/TestUtils";

const WasabiPoolFactory = artifacts.require("WasabiPoolFactory");
const WasabiOption = artifacts.require("WasabiOption");
const TestERC721 = artifacts.require("TestERC721");
const LendingAddressProvider = artifacts.require("LendingAddressProvider");
const WasabiBNPL = artifacts.require("WasabiBNPL");
const Flashloan = artifacts.require("Flashloan");
const WETH9 = artifacts.require("WETH9");
const MockLending = artifacts.require("MockLending");
const MockNFTLending = artifacts.require("MockNFTLending");
const MockMarketplace = artifacts.require("MockMarketplace");
const WasabiConduit = artifacts.require("WasabiConduit");
const WasabiFeeManager = artifacts.require("WasabiFeeManager");

contract("WasabiBNPL", (accounts) => {
  let poolFactory: WasabiPoolFactoryInstance;
  let option: WasabiOptionInstance;
  let addressProvider: LendingAddressProviderInstance;
  let testNft: TestERC721Instance;
  let tokenToBuy: BN;
  let optionId: BN;
  let bnpl: WasabiBNPLInstance;
  let flashloan: FlashloanInstance;
  let marketplace: MockMarketplaceInstance;
  let lending: MockLendingInstance;
  let nftLending: MockNFTLendingInstance;
  let weth: WETH9Instance;
  let wholeSnapshotId: any;
  let unitSnapshotId: any;
  let conduit: WasabiConduitInstance;
  let feeManager: WasabiFeeManagerInstance;

  const deployer = accounts[0];
  const lp = accounts[2];
  const buyer = accounts[3];
  const someoneElse = accounts[5];
  const initialFlashLoanPoolBalance = 15;
  let royaltyPayoutPercent = 20;
  const originalPayoutPercent = 1000;

  const buyerPrivateKey = "c88b703fb08cbea894b6aeff5a544fb92e78a18e19814cd85da83b71f772aa6c";
  const someoneElsePrivateKey = "659cbb0e2411a44db63778987b1e22153c086a95eb6b18bdf89de078917abc63";

  before("Prepare State", async function () {
    testNft = await TestERC721.deployed();
    option = await WasabiOption.deployed();
    poolFactory = await WasabiPoolFactory.deployed();
    addressProvider = await LendingAddressProvider.deployed();

    weth = await WETH9.deployed();
    marketplace = await MockMarketplace.new(weth.address);
    lending = await MockLending.deployed();
    nftLending = await MockNFTLending.new(lending.address);
    flashloan = await Flashloan.deployed();
    conduit = await WasabiConduit.deployed();
    feeManager = await WasabiFeeManager.deployed();
    bnpl = await WasabiBNPL.new(
      option.address,
      flashloan.address,
      addressProvider.address,
      weth.address,
      poolFactory.address
    );

    await option.toggleFactory(poolFactory.address, true);
    await poolFactory.togglePool(bnpl.address, PoolState.ACTIVE);

    await conduit.setPoolFactoryAddress(poolFactory.address);
    await conduit.setOption(option.address);
    await conduit.setBNPL(bnpl.address);

    // Set Fee
    await feeManager.setFraction(royaltyPayoutPercent);
    await feeManager.setDenominator(originalPayoutPercent);

    await web3.eth.sendTransaction({
      from: lp,
      to: flashloan.address,
      value: toEth(initialFlashLoanPoolBalance),
    });
    await flashloan.enableFlashloaner(bnpl.address, true, 100);

    await weth.deposit(metadata(lp, 40));
    await weth.transfer(lending.address, toEth(20), metadata(lp));
    await weth.transfer(marketplace.address, toEth(20), metadata(lp));

    await addressProvider.addLending(nftLending.address);

    let mintResult = await testNft.mint();
    tokenToBuy = mintResult.logs.find((e) => e.event == "Transfer")
      ?.args[2] as BN;
    await testNft.transferFrom(deployer, marketplace.address, tokenToBuy);
  });

  it("Execute BNPL", async () => {
    const price = toEth(13);

    await marketplace.setPrice(testNft.address, tokenToBuy, price);

    const approveCallData = web3.eth.abi.encodeFunctionCall(
      testNft.abi.find((a) => a.name === "setApprovalForAll")!,
      [marketplace.address, "true"]
    );
    const approveCall = {
      to: testNft.address,
      value: 0,
      data: approveCallData,
    };
    const buyCallData = web3.eth.abi.encodeFunctionCall(
      marketplace.abi.find((a) => a.name === "buy")!,
      [testNft.address, tokenToBuy.toString()]
    );
    const buyCall = {
      to: marketplace.address,
      value: price,
      data: buyCallData,
    };

    const buySignature = await signFunctionCallData(buyCall, deployer);
    const approvalSignature = await signFunctionCallData(approveCall, deployer);
    let signatures = [];
    signatures.push(buySignature);

    const loanAmount = toEth(10);
    const repayment = toEth(10.5);
    const borrowData = ethers.utils.AbiCoder.prototype.encode(
      ["address", "uint256", "uint256", "uint256"],
      [testNft.address, tokenToBuy.toString(), loanAmount, repayment]
    );

    // List of marketplace calldata and Signature's length is not same, should revert.
    await truffleAssert.reverts(
      bnpl.bnpl(
        nftLending.address,
        borrowData,
        toEth(13),
        [buyCall],
        [],
        metadata(buyer, 3.5)
      ),
      "Length is invalid"
    );

    // List of marketplace calldata's length can't be zero, should revert.
    await truffleAssert.reverts(
      bnpl.bnpl(
        nftLending.address,
        borrowData,
        toEth(13),
        [],
        signatures,
        metadata(buyer, 3.5)
      ),
      "Need marketplace calls"
    );

    // When trying to sign with buyer address, should revert.
    const wrongSignature = await signFunctionCallData(buyCall, buyer);

    await truffleAssert.reverts(
      bnpl.bnpl(
        nftLending.address,
        borrowData,
        toEth(13),
        [buyCall],
        [wrongSignature],
        metadata(buyer, 3.5)
      ),
      "Owner is not signer"
    );

    const invalidLendingAddress = "0xb0d1140a09f669935b4848f6826fd16ff19787b9";

    // Nft Lending address should be added in AddressProvider, should revert.
    await expectRevertCustomError(
      bnpl.bnpl(
        invalidLendingAddress,
        borrowData,
        toEth(13),
        [buyCall],
        signatures,
        metadata(buyer, 3.5)
      ),
      "InvalidParam",
      "Nft Lending Address is invalid."
    );

    const callData = [approveCall, buyCall];
    signatures = [approvalSignature, buySignature];

    optionId = await bnpl.bnpl.call(
      nftLending.address,
      borrowData,
      toEth(13),
      callData,
      signatures,
      metadata(buyer, 3.5)
    );

    await bnpl.bnpl(
      nftLending.address,
      borrowData,
      toEth(13),
      callData,
      signatures,
      metadata(buyer, 3.5)
    );

    assert.equal(await option.ownerOf(optionId), buyer);
    assert.equal(await testNft.ownerOf(tokenToBuy), lending.address);
  });

  it("should get option data", async () => {
    wholeSnapshotId = await takeSnapshot();

    let optionData = await bnpl.getOptionData(optionId);
    assert.equal(optionData.active, true);
    assert.equal(optionData.optionType.toString(), "0");
    assert.equal(optionData.strikePrice.toString(), toEth(10.5).toString());
    assert.equal(optionData.tokenId.toString(), tokenToBuy.toString());

    await advanceTime(3600 * 24 * 30);
    await advanceBlock();

    optionData = await bnpl.getOptionData(optionId);
    assert.equal(optionData.active, false);
    assert.equal(optionData.optionType.toString(), "0");
    assert.equal(optionData.strikePrice.toString(), toEth(10.5).toString());
    assert.equal(optionData.tokenId.toString(), tokenToBuy.toString());

    // Revert advanced time as previous time
    await revert(wholeSnapshotId);
  });

  it("List and acceptAsk", async () => {
    wholeSnapshotId = await takeSnapshot();

    const price = 1;
    let optionOwner = await option.ownerOf(optionId);

    await option.setApprovalForAll(conduit.address, true, metadata(optionOwner));

    let blockTimestamp = await (await web3.eth.getBlock(await web3.eth.getBlockNumber())).timestamp;
    const ask: Ask = {
        id: 1,
        optionId: optionId.toString(),
        orderExpiry: Number(blockTimestamp) + 20,
        price: toEth(price),
        seller: optionOwner,
        tokenAddress: ZERO_ADDRESS,
    };

    const signature = await signAskWithEIP712(ask, conduit.address, buyerPrivateKey);

    // Fee Manager
    const royaltyReceiver = await feeManager.owner()
    const initialRoyaltyReceiverBalance = toBN(await web3.eth.getBalance(royaltyReceiver));

    const initialBalanceBuyer = toBN(await web3.eth.getBalance(someoneElse));
    const initialBalanceSeller = toBN(await web3.eth.getBalance(optionOwner));

    const acceptAskResult = await conduit.acceptAsk(ask, signature, metadata(someoneElse, price));

    const finalBalanceBuyer = toBN(await web3.eth.getBalance(someoneElse));
    const finalBalanceSeller = toBN(await web3.eth.getBalance(optionOwner));
    const finalRoyaltyReceiverBalance = toBN(await web3.eth.getBalance(royaltyReceiver));

    truffleAssert.eventEmitted(acceptAskResult, "AskTaken", null, "Ask wasn't taken");
    assert.equal(await option.ownerOf(optionId), someoneElse, "Option not owned after buying");

    const royaltyAmount = price * royaltyPayoutPercent / originalPayoutPercent;
    const sellerAmount = price - royaltyAmount;

    assert.equal(fromWei(finalBalanceSeller.sub(initialBalanceSeller).toString()), sellerAmount, 'Seller incorrect balance change')
    assert.equal(fromWei(initialBalanceBuyer.sub(finalBalanceBuyer).toString()), price + fromWei(gasOfTxn(acceptAskResult.receipt)), 'Seller incorrect balance change')

    // Fee Manager
    assert.equal(fromWei(finalRoyaltyReceiverBalance.sub(initialRoyaltyReceiverBalance).toString()), royaltyAmount, 'Fee receiver incorrect balance change')

    // Revert advanced time as previous time
    await revert(wholeSnapshotId);
  });

  it("Bid and acceptBid", async () => {
    wholeSnapshotId = await takeSnapshot();

    const price = 1;
    await weth.deposit(metadata(someoneElse, price * 2));
    await weth.approve(conduit.address, toEth(price * 2), metadata(someoneElse));

    let optionOwner = await option.ownerOf(optionId);
    
    await option.setApprovalForAll(conduit.address, true, metadata(optionOwner));

    const optionData: OptionData = await bnpl.getOptionData(optionId);
    let blockTimestamp = (await web3.eth.getBlock(await web3.eth.getBlockNumber())).timestamp;
    const bid: Bid = {
        id: 2,
        price: toEth(price),
        tokenAddress: weth.address,
        collection: testNft.address,
        orderExpiry: Number(blockTimestamp) + 20,
        buyer: someoneElse,
        optionType: optionData.optionType,
        strikePrice: optionData.strikePrice,
        expiry: Number(optionData.expiry.toString()) + 100,
        expiryAllowance: 100,
        optionTokenAddress: weth.address,
    };

    const signature = await signBidWithEIP712(bid, conduit.address, someoneElsePrivateKey); // buyer signs it

    // Fee Manager
    const royaltyReceiver = await feeManager.owner()
    const initialRoyaltyReceiverBalance = await weth.balanceOf(royaltyReceiver);
    
    const initialBalanceBuyer = await weth.balanceOf(bid.buyer);
    const initialBalanceSeller = await weth.balanceOf(optionOwner);
    const acceptBidResult = await conduit.acceptBid(optionId, bnpl.address, bid, signature, metadata(optionOwner));
    const finalBalanceBuyer = await weth.balanceOf(bid.buyer);
    const finalBalanceSeller = await weth.balanceOf(optionOwner);
    const finalRoyaltyReceiverBalance = await weth.balanceOf(royaltyReceiver);

    truffleAssert.eventEmitted(acceptBidResult, "BidTaken", null, "Bid wasn't taken");
    assert.equal(await option.ownerOf(optionId), bid.buyer, "Option not owned after buying");
    assert.equal(fromWei(initialBalanceBuyer.sub(finalBalanceBuyer)), price, 'Buyer incorrect balance change')
    
    const royaltyAmount = price * royaltyPayoutPercent / originalPayoutPercent;
    const sellerAmount = price - royaltyAmount;
    assert.equal(fromWei(finalBalanceSeller.sub(initialBalanceSeller)), sellerAmount, 'Seller incorrect balance change')

    // Fee Manager
    assert.equal(fromWei(finalRoyaltyReceiverBalance.sub(initialRoyaltyReceiverBalance)), royaltyAmount, 'Fee receiver incorrect balance change')

    // Revert advanced time as previous time
    await revert(wholeSnapshotId);
  });

  it("should execute option", async () => {
    wholeSnapshotId = await takeSnapshot();

    // Only owner can exerciese option, should revert
    await truffleAssert.reverts(
      bnpl.executeOption(optionId, { from: deployer }),
      "Only owner can exercise option"
    );

    // Insufficient repay amount option, should revert
    await truffleAssert.reverts(
      bnpl.executeOption(optionId, { from: buyer, value: toEth(5) }),
      "Insufficient repay amount supplied"
    );

    // Take snapshot, before advancing time and block
    unitSnapshotId = await takeSnapshot();

    // Advance 30 days
    await advanceTime(3600 * 24 * 30);
    await advanceBlock();

    // Because time is past at loan's expiration date, should revert
    await truffleAssert.reverts(
      bnpl.executeOption(optionId, { from: buyer }),
      "Loan has expired"
    );

    // Revert advanced time as previous one
    await revert(unitSnapshotId);

    // Check if event emitted.
    const executeOptionResult = await bnpl.executeOption(optionId, {
      from: buyer,
      value: toEth(15),
    });
    await truffleAssert.eventEmitted(
      executeOptionResult,
      "OptionExecuted",
      null,
      "Executed Option"
    );

    // Once executing Option is finished, Option should be burned.
    await truffleAssert.reverts(
      option.ownerOf(optionId),
      "ERC721: invalid token ID"
    );

    await revert(wholeSnapshotId);
  });

  it("should execute option with arbitrage", async () => {
    wholeSnapshotId = await takeSnapshot();

    const approveCallData = web3.eth.abi.encodeFunctionCall(
      testNft.abi.find((a) => a.name === "approve")!,
      [marketplace.address, tokenToBuy.toString()]
    );
    const approveCall = {
      to: testNft.address,
      value: 0,
      data: approveCallData,
    };

    const sellCallData = web3.eth.abi.encodeFunctionCall(
      marketplace.abi.find((a) => a.name === "sell")!,
      [testNft.address, tokenToBuy.toString()]
    );
    const sellCall = {
      to: marketplace.address,
      value: 0,
      data: sellCallData,
    };

    const approveSignature = await signFunctionCallData(approveCall, deployer);
    const sellSignature = await signFunctionCallData(sellCall, deployer);

    const signatures = [];
    signatures.push(approveSignature);
    signatures.push(sellSignature);

    // List of marketplace calldata and Signature's length is not same, should revert.
    await truffleAssert.reverts(
      bnpl.executeOptionWithArbitrage(optionId, [approveCall, sellCall], []),
      "Length is invalid"
    );

    // List of marketplace calldata's length can't be zero, should revert.
    await truffleAssert.reverts(
      bnpl.executeOptionWithArbitrage(optionId, [], signatures),
      "Need marketplace calls"
    );

    // When trying to sign with buyer address, should revert.
    const wrongSignature = await signFunctionCallData(sellCall, buyer);

    // List of marketplace calldata's length can't be zero, should revert.
    await truffleAssert.reverts(
      bnpl.executeOptionWithArbitrage(
        optionId,
        [approveCall, sellCall],
        [approveSignature, wrongSignature],
        { from: deployer }
      ),
      "Owner is not signer"
    );

    // Take snapshot, before advancing time and block
    unitSnapshotId = await takeSnapshot();

    // Advance 31 days
    await advanceTime(3600 * 24 * 31);
    await advanceBlock();

    // Because time is past at loan's expiration date, should revert.
    await truffleAssert.reverts(
      bnpl.executeOptionWithArbitrage(
        optionId,
        [approveCall, sellCall],
        signatures,
        { from: buyer }
      ),
      "Loan has expired"
    );

    await revert(unitSnapshotId);

    const executeAritrageResult = await bnpl.executeOptionWithArbitrage(
      optionId,
      [approveCall, sellCall],
      signatures,
      { from: buyer }
    );

    await truffleAssert.eventEmitted(
      executeAritrageResult,
      "OptionExecutedWithArbitrage",
      null,
      "Executed Option With Arbitrage"
    );

    // Once executing Option is finished, Option should be burned.
    await truffleAssert.reverts(
      option.ownerOf(optionId),
      "ERC721: invalid token ID"
    );

    await revert(wholeSnapshotId);
  });

  it("rollover -- lower LTV", async () => {
    wholeSnapshotId = await takeSnapshot();

    const previousRepaymentAmount = toBN(toEth(10.5));

    const loanAmount = toEth(9);
    const repayment = toEth(9.5);
    const borrowData = ethers.utils.AbiCoder.prototype.encode(
      ["address", "uint256", "uint256", "uint256"],
      [testNft.address, tokenToBuy.toString(), loanAmount, repayment]
    );

    const flashLoanFee = previousRepaymentAmount.div(toBN(100));
    const topoff = previousRepaymentAmount.sub(toBN(loanAmount));
    const value = flashLoanFee.add(topoff);

    const result = await bnpl.rolloverOption(optionId, nftLending.address, borrowData, {from: buyer, value});
    await truffleAssert.eventEmitted(result, "OptionRolledOver", null, "Option rolled over");

    await revert(wholeSnapshotId);
  });

  it("rollover -- higher LTV", async () => {
    wholeSnapshotId = await takeSnapshot();

    const previousRepaymentAmount = toBN(toEth(10.5));

    const loanAmount = toEth(14);
    const repayment = toEth(14.5);
    const borrowData = ethers.utils.AbiCoder.prototype.encode(
      ["address", "uint256", "uint256", "uint256"],
      [testNft.address, tokenToBuy.toString(), loanAmount, repayment]
    );

    const flashLoanFee = previousRepaymentAmount.div(toBN(100));
    const topoff = toBN(loanAmount).gte(previousRepaymentAmount) ? toBN(0) : previousRepaymentAmount.sub(toBN(loanAmount));
    const value = flashLoanFee.add(topoff);

    const extenderBalanceBefore = toBN(await web3.eth.getBalance(buyer));

    const result = await bnpl.rolloverOption(optionId, nftLending.address, borrowData, {from: buyer, value});
    await truffleAssert.eventEmitted(result, "OptionRolledOver", null, "Option rolled over");

    const extenderBalanceAfter = toBN(await web3.eth.getBalance(buyer));

    const refundAmount = extenderBalanceAfter.sub(extenderBalanceBefore);
    assert.equal(
      refundAmount.toString(),
      toBN(loanAmount).sub(previousRepaymentAmount).sub(flashLoanFee).sub(gasOfTxn(result.receipt)).toString(),
      'Not enough refunded');

    await revert(wholeSnapshotId);
  });

  it("rollover -- same LTV", async () => {
    wholeSnapshotId = await takeSnapshot();

    const previousRepaymentAmount = toBN(toEth(10.5));

    const loanAmount = toEth(10.5);
    const repayment = toEth(11);
    const borrowData = ethers.utils.AbiCoder.prototype.encode(
      ["address", "uint256", "uint256", "uint256"],
      [testNft.address, tokenToBuy.toString(), loanAmount, repayment]
    );

    const flashLoanFee = previousRepaymentAmount.div(toBN(100));
    const topoff = toBN(loanAmount).gte(previousRepaymentAmount) ? toBN(0) : previousRepaymentAmount.sub(toBN(loanAmount));
    const value = flashLoanFee.add(topoff);

    const result = await bnpl.rolloverOption(optionId, nftLending.address, borrowData, {from: buyer, value});
    await truffleAssert.eventEmitted(result, "OptionRolledOver", null, "Option rolled over");

    await revert(wholeSnapshotId);
  });
});
