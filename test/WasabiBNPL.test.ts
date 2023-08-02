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
} from "../types/truffle-contracts";
import { PoolState } from "./util/TestTypes";
import {
  signFunctionCallData,
  metadata,
  toEth,
  advanceTime,
  advanceBlock,
  expectRevertCustomError,
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

  const deployer = accounts[0];
  const lp = accounts[2];
  const buyer = accounts[3];

  const initialFlashLoanPoolBalance = 15;

  before("Prepare State", async function () {
    testNft = await TestERC721.deployed();
    option = await WasabiOption.deployed();
    poolFactory = await WasabiPoolFactory.deployed();
    await option.toggleFactory(poolFactory.address, true);
    addressProvider = await LendingAddressProvider.new();

    let mintResult = await testNft.mint();
    tokenToBuy = mintResult.logs.find((e) => e.event == "Transfer")
      ?.args[2] as BN;

    weth = await WETH9.deployed();
    marketplace = await MockMarketplace.deployed();
    lending = await MockLending.new(weth.address);
    nftLending = await MockNFTLending.new();
    flashloan = await Flashloan.new();
    bnpl = await WasabiBNPL.new(
      option.address,
      flashloan.address,
      addressProvider.address,
      weth.address,
      poolFactory.address
    );

    await poolFactory.togglePool(bnpl.address, PoolState.ACTIVE);

    await web3.eth.sendTransaction({
      from: lp,
      to: flashloan.address,
      value: toEth(initialFlashLoanPoolBalance),
    });
    await flashloan.enableFlashloaner(bnpl.address, true, 100);

    await weth.deposit(metadata(lp, 10));
    await weth.transfer(lending.address, toEth(10), metadata(lp));

    await addressProvider.addLending(nftLending.address);

    await testNft.transferFrom(deployer, marketplace.address, tokenToBuy);
  });

  it("Execute BNPL", async () => {
    const price = toEth(13);

    await marketplace.setPrice(testNft.address, tokenToBuy, price);

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
    const signatures = [];
    signatures.push(buySignature);

    const loanAmount = toEth(10);
    const repayment = toEth(10.5);
    const borrowData = ethers.utils.AbiCoder.prototype.encode(
      ["address", "uint256", "uint256", "uint256"],
      [testNft.address, tokenToBuy.toString(), loanAmount, repayment]
    );

    optionId = await bnpl.bnpl.call(
      nftLending.address,
      borrowData,
      toEth(13),
      [buyCall],
      signatures,
      metadata(buyer, 3.5)
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

    await bnpl.bnpl(
      nftLending.address,
      borrowData,
      toEth(13),
      [buyCall],
      signatures,
      metadata(buyer, 3.5)
    );
  });

  it("should get option data", async () => {
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
  });

  it("should execute option", async () => {
    await truffleAssert.reverts(
      bnpl.executeOption(optionId, { from: deployer }),
      "Only owner can exercise option"
    );

    await truffleAssert.reverts(
      bnpl.executeOption(optionId, { from: buyer }),
      "Loan has expired"
    );

    //  await bnpl.executeOption(optionId, { from: buyer, value: toEth(5) });
  });
});
