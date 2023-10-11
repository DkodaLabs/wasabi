const truffleAssert = require("truffle-assertions");
const ethers = require("ethers");

import {
  WasabiPoolFactoryInstance,
  WasabiOptionInstance,
  TestERC721Instance,
  WasabiBNPLInstance,
  FlashloanInstance,
  MockMarketplaceInstance,
  WETH9Instance,
  LendingAddressProviderInstance,
  TellerLendingInstance,
  MockTellerLendingContractInstance,
} from "../types/truffle-contracts";
import { PoolState } from "./util/TestTypes";
import {
  signFunctionCallData,
  metadata,
  toEth,
  takeSnapshot,
  revert,
  toBN,
  fromWei,
  encodeTellerData,
} from "./util/TestUtils";

const WasabiPoolFactory = artifacts.require("WasabiPoolFactory");
const WasabiOption = artifacts.require("WasabiOption");
const TestERC721 = artifacts.require("TestERC721");
const LendingAddressProvider = artifacts.require("LendingAddressProvider");
const WasabiBNPL = artifacts.require("WasabiBNPL");
const Flashloan = artifacts.require("Flashloan");
const WETH9 = artifacts.require("WETH9");
const MockMarketplace = artifacts.require("MockMarketplace");
const TellerLending = artifacts.require("TellerLending");
const MockTellerLendingContract = artifacts.require("MockTellerLendingContract");

contract("TellerLending Test", (accounts) => {
  let poolFactory: WasabiPoolFactoryInstance;
  let option: WasabiOptionInstance;
  let addressProvider: LendingAddressProviderInstance;
  let testNft: TestERC721Instance;
  let tokenToBuy: BN;
  let optionId: BN;
  let bnpl: WasabiBNPLInstance;
  let flashloan: FlashloanInstance;
  let marketplace: MockMarketplaceInstance;
  let teller: TellerLendingInstance;
  let mockTeller: MockTellerLendingContractInstance;
  let weth: WETH9Instance;
  let wholeSnapshotId: any;

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
    teller = await TellerLending.deployed();
    mockTeller = await MockTellerLendingContract.deployed();
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
      to: mockTeller.address,
      value: toEth(20),
    });
    await flashloan.enableFlashloaner(bnpl.address, true, 0);

    await weth.deposit(metadata(lp, 30));
    await weth.transfer(marketplace.address, toEth(20), metadata(lp));

    await addressProvider.addLending(teller.address);

    let mintResult = await testNft.mint();
    tokenToBuy = mintResult.logs.find((e) => e.event == "Transfer")
      ?.args[2] as BN;
    await testNft.transferFrom(deployer, marketplace.address, tokenToBuy);
  });

  it("Execute BNPL", async () => {
    const marketplaceId = 5;
    const loanAmount = 5;

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

    const borrowData = encodeTellerData(
        "123",
        toEth(loanAmount),
        1,
        tokenToBuy,
        testNft.address,
        3000,
        86400 * 30,
        marketplaceId,
        [
            '0x23362c07b7d7e559e7a7433d622a943ca111e58cfa1fe052812c7b83833f9f49',
            '0x2023dd98548e897f0f53fddc0bf02836959c12765a68619038ff89b0d59ff4e6',
            '0x23362c07b7d7e559e7a7433d622a943ca111e58cfa1fe052812c7b83833f9f49',
            '0x2023dd98548e897f0f53fddc0bf02836959c12765a68619038ff89b0d59ff4e6',
            '0x23362c07b7d7e559e7a7433d622a943ca111e58cfa1fe052812c7b83833f9f49',
            '0x2023dd98548e897f0f53fddc0bf02836959c12765a68619038ff89b0d59ff4e6'
        ]
    );

    const amountToBorrower = await teller.calculateAmountToBorrower(toEth(loanAmount), marketplaceId);
    const value = toBN(toEth(price)).sub(amountToBorrower);

    optionId = await bnpl.bnpl.call(
      teller.address,
      borrowData,
      toEth(loanAmount),
      functionCalls,
      signatures,
      { from: buyer, value }
    );

    await bnpl.bnpl(
      teller.address,
      borrowData,
      toEth(loanAmount),
      functionCalls,
      signatures,
      { from: buyer, value }
    );

    assert.equal(await option.ownerOf(optionId), buyer);
    assert.equal(await testNft.ownerOf(tokenToBuy), mockTeller.address);
  });

  it("Execute Option", async () => {
    wholeSnapshotId = await takeSnapshot();

    const loanDetails = await bnpl.optionToLoan(optionId);
    const loanId = toBN(loanDetails[1]);
    // const loan = await mockTeller.getLoan(loanId);
    const optionDetails = await bnpl.getOptionData(optionId);

    console.log('balance', (await web3.eth.getBalance(buyer)).toString());
    console.log('strike', optionDetails.strikePrice.toString());

    await bnpl.executeOption(optionId, { from: buyer, value: optionDetails.strikePrice });

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
    // const loan = await mockTeller.getLoan(loanId);
    // const optionDetails = await bnpl.getOptionData(optionId);

    await bnpl.executeOptionWithArbitrage(
      optionId,
      [approveCall, sellCall],
      [approveSignature, sellSignature],
      metadata(buyer));

    assert.equal(await testNft.ownerOf(tokenToBuy), marketplace.address);
    await truffleAssert.reverts(option.ownerOf(optionId), "ERC721: invalid token ID", "Option NFT not burned after execution");
  });
});