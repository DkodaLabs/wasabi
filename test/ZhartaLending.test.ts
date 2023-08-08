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
  let weth: WETH9Instance;
  let wholeSnapshotId: any;
  let unitSnapshotId: any;

  const deployer = accounts[0];
  const lp = accounts[2];
  const buyer = accounts[3];
  const initialFlashLoanPoolBalance = 15;

  before("Prepare State", async function () {
    testNft = await TestERC721.deployed();
    option = await WasabiOption.deployed();
    poolFactory = await WasabiPoolFactory.deployed();
    addressProvider = await LendingAddressProvider.deployed();

    weth = await WETH9.deployed();
    marketplace = await MockMarketplace.new(weth.address);
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
    await flashloan.enableFlashloaner(bnpl.address, true, 100);

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
    const price = toEth(13);

    const data = {
        amount: '121455000000000000',
        interest: 288,
        maturity: '1694102541',
        collaterals: {
          contractAddress: testNft.address,
          tokenId: tokenToBuy.toString(),
          amount: '121455000000000000'
        },
        delegations: false,
        deadline: '1691512341',
        nonce: '0',
        genesisToken: 0,
        v: '27',
        r: '108696869468085757493377642248186281836882762966372755015796929480269691791653',
        s: '10485678798739289468371229199860095789121425267672879654434189836125882124520'
      };

    const borrowData = encodeZhartaData(data);

    // await zharta.borrow(borrowData);

    optionId = await bnpl.bnpl.call(
      zharta.address,
      borrowData,
      toEth(0),
      [],
      [],
      metadata(buyer, 3.5)
    );

    await bnpl.bnpl(
      zharta.address,
      borrowData,
      toEth(0),
      [],
      [],
      metadata(buyer, 3.5)
    );

    assert.equal(await option.ownerOf(optionId), buyer);
    // assert.equal(await testNft.ownerOf(tokenToBuy), lending.address);
  });
});