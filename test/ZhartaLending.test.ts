const truffleAssert = require("truffle-assertions");
const ethers = require("ethers");

import {
  WasabiPoolFactoryInstance,
  WasabiOptionInstance,
  TestERC721Instance,
  WasabiBNPLInstance,
  FlashloanInstance,
  MockMarketplaceInstance,
  ZhartaLendingInstance,
  WETH9Instance,
  LendingAddressProviderInstance,
  MockZhartaInstance,
} from "../types/truffle-contracts";
import { PoolState } from "./util/TestTypes";
import {
  signFunctionCallData,
  metadata,
  toEth,
  advanceTime,
  advanceBlock,
  takeSnapshot,
  revert,
  expectRevertCustomError,
  encodeZhartaData,
  toBN,
  fromWei,
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
const ZhartaLending = artifacts.require("ZhartaLending");
const MockZharta = artifacts.require("MockZharta");

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
  let zharta: ZhartaLendingInstance;
  let mockZharta: MockZhartaInstance;
  let weth: WETH9Instance;
  let wholeSnapshotId: any;
  let unitSnapshotId: any;

  const deployer = accounts[0];
  const lp = accounts[2];
  const buyer = accounts[3];
  const initialFlashLoanPoolBalance = 15;

  const price = 6;

  before("Prepare State", async function () {
    testNft = await TestERC721.deployed();
    option = await WasabiOption.deployed();
    poolFactory = await WasabiPoolFactory.deployed();
    addressProvider = await LendingAddressProvider.deployed();

    weth = await WETH9.deployed();
    marketplace = await MockMarketplace.new(weth.address);
    mockZharta = await MockZharta.deployed();
    zharta = await ZhartaLending.deployed();
    flashloan = await Flashloan.deployed();
    bnpl = await WasabiBNPL.new(
      option.address,
      flashloan.address,
      addressProvider.address,
      weth.address,
      poolFactory.address
    );

    await option.toggleFactory(poolFactory.address, true);
    await poolFactory.togglePool(bnpl.address, PoolState.ACTIVE);

    await web3.eth.sendTransaction({
      from: lp,
      to: flashloan.address,
      value: toEth(initialFlashLoanPoolBalance),
    });

    await web3.eth.sendTransaction({
      from: lp,
      to: mockZharta.address,
      value: toEth(20),
    });
    await flashloan.enableFlashloaner(bnpl.address, true, 0);

    await weth.deposit(metadata(lp, 30));
    await weth.transfer(zharta.address, toEth(10), metadata(lp));
    await weth.transfer(marketplace.address, toEth(20), metadata(lp));

    await addressProvider.addLending(zharta.address);

    let mintResult = await testNft.mint();
    tokenToBuy = mintResult.logs.find((e) => e.event == "Transfer")
      ?.args[2] as BN;
    await testNft.transferFrom(deployer, marketplace.address, tokenToBuy);
  });

  it("Execute BNPL", async () => {
    const loanAmount = 5;

    let blockNumber = await web3.eth.getBlockNumber();
    let maturity = Number((await web3.eth.getBlock(blockNumber)).timestamp) + 86400;

    await marketplace.setPrice(testNft.address, tokenToBuy, toEth(price));

    const buyCallData = 
        web3.eth.abi.encodeFunctionCall(
            marketplace.abi.find(a => a.name === 'buy')!,
            [testNft.address, tokenToBuy.toString()]);
    const functionCall = {
        to: marketplace.address,
        value: toEth(price),
        data: buyCallData
    };

    const signature = await signFunctionCallData(functionCall, deployer);
    const functionCalls = [functionCall];
    const signatures = [signature];

    const data = {
        amount: toEth(loanAmount),
        interest: 300,
        maturity: maturity,
        collaterals: {
          contractAddress: testNft.address,
          tokenId: tokenToBuy,
          amount: toEth(loanAmount)
        },
        delegations: false,
        deadline: maturity,
        nonce: '0',
        genesisToken: 0,
        v: '27',
        r: '108696869468085757493377642248186281836882762966372755015796929480269691791653',
        s: '10485678798739289468371229199860095789121425267672879654434189836125882124520'
      };

    const borrowData = encodeZhartaData(data);

    optionId = await bnpl.bnpl.call(
      zharta.address,
      borrowData,
      toEth(loanAmount),
      functionCalls,
      signatures,
      metadata(buyer, price - loanAmount)
    );

    await bnpl.bnpl(
      zharta.address,
      borrowData,
      toEth(loanAmount),
      functionCalls,
      signatures,
      metadata(buyer, price - loanAmount)
    );

    assert.equal(await option.ownerOf(optionId), buyer);
    assert.equal(await testNft.ownerOf(tokenToBuy), mockZharta.address);
  });

  it("Execute Option", async () => {
    wholeSnapshotId = await takeSnapshot();

    const loanDetails = await bnpl.optionToLoan(optionId);
    const loanId = toBN(loanDetails[1]);
    const loan = await mockZharta.getLoan(bnpl.address, loanId);
    const optionDetails = await bnpl.getOptionData(optionId);

    const strike = fromWei(optionDetails.strikePrice);
    await bnpl.executeOption(optionId, metadata(buyer, strike));

    assert.equal(await testNft.ownerOf(tokenToBuy), buyer);
    await truffleAssert.reverts(option.ownerOf(optionId), "ERC721: invalid token ID", "Option NFT not burned after execution");

    await revert(wholeSnapshotId);
  });

  it("Execute Option With Arbitrage", async () => {
    wholeSnapshotId = await takeSnapshot();

    await marketplace.setPrice(testNft.address, tokenToBuy, toEth(price + 1));
    const approveCallData =
        web3.eth.abi.encodeFunctionCall(
            testNft.abi.find(a => a.name === 'approve')!,
            [marketplace.address, tokenToBuy.toString()]);
    const approveCall = {
        to: testNft.address,
        value: 0,
        data: approveCallData,
    }

    const sellCallData = 
        web3.eth.abi.encodeFunctionCall(
            marketplace.abi.find(a => a.name === 'sell')!,
            [testNft.address, tokenToBuy.toString()]);
    const sellCall = {
        to: marketplace.address,
        value: 0,
        data: sellCallData
    };

    const approveSignature = await signFunctionCallData(approveCall, deployer);
    const sellSignature = await signFunctionCallData(sellCall, deployer);

    const loanDetails = await bnpl.optionToLoan(optionId);
    const loanId = toBN(loanDetails[1]);
    const loan = await mockZharta.getLoan(bnpl.address, loanId);
    const optionDetails = await bnpl.getOptionData(optionId);

    await bnpl.executeOptionWithArbitrage(
      optionId,
      [approveCall, sellCall],
      [approveSignature, sellSignature],
      metadata(buyer));

    assert.equal(await testNft.ownerOf(tokenToBuy), marketplace.address);
    await truffleAssert.reverts(option.ownerOf(optionId), "ERC721: invalid token ID", "Option NFT not burned after execution");
  });
});