const truffleAssert = require('truffle-assertions');

import { s } from "@reservoir0x/sdk/dist/utils";
import { WasabiPoolFactoryInstance, WasabiOptionInstance, TestERC721Instance, ETHWasabiPoolInstance, WasabiOptionArbitrageInstance, MockAavePoolInstance, MockMarketplaceInstance, WETH9Instance, MockMarketplaceContract, WasabiFeeManagerInstance } from "../types/truffle-contracts";
import { OptionExecuted, OptionIssued } from "../types/truffle-contracts/IWasabiPool";
import { PoolAsk, OptionType, ZERO_ADDRESS } from "./util/TestTypes";
import { assertIncreaseInBalance, expectRevertCustomError, gasOfTxn, makeRequest, metadata, signPoolAskWithEIP712, toBN, toEth, withFee } from "./util/TestUtils";

const Signing = artifacts.require("Signing");
const WasabiPoolFactory = artifacts.require("WasabiPoolFactory");
const WasabiOption = artifacts.require("WasabiOption");
const ETHWasabiPool = artifacts.require("ETHWasabiPool");
const TestERC721 = artifacts.require("TestERC721");
const WasabiOptionArbitrage = artifacts.require("WasabiOptionArbitrage");
const WETH9 = artifacts.require("WETH9");
const MockAavePool = artifacts.require("MockAavePool");
const MockMarketplace = artifacts.require("MockMarketplace");
const WasabiFeeManager = artifacts.require("WasabiFeeManager");

contract("WasabiOptionArbitrage CALL", (accounts) => {
    let poolFactory: WasabiPoolFactoryInstance;
    let feeManager: WasabiFeeManagerInstance;
    let option: WasabiOptionInstance;
    let testNft: TestERC721Instance;
    let tokenToSell: BN;
    let pool: ETHWasabiPoolInstance;
    let optionId: BN;
    let request: PoolAsk;
    let arbitrage: WasabiOptionArbitrageInstance;
    let aavePool: MockAavePoolInstance;
    let marketplace: MockMarketplaceInstance;
    let weth: WETH9Instance;

    const lp = accounts[2];
    const buyer = accounts[3];
    const lpPrivateKey = "0dbbe8e4ae425a6d2687f1a7e3ba17bc98c673636790f1b8ad91193c05875ef1";
    const duration = 10000;

    const strikePrice = 10;
    const premium = 1;
    const initialFlashLoanPoolBalance = 25;

    let signature;

    before("Prepare State", async function () {
        testNft = await TestERC721.deployed();
        await Signing.deployed();
        option = await WasabiOption.deployed();
        poolFactory = await WasabiPoolFactory.deployed();
        await option.toggleFactory(poolFactory.address, true);
        feeManager = await WasabiFeeManager.deployed();

        let mintResult = await testNft.mint(metadata(lp));
        tokenToSell = mintResult.logs.find(e => e.event == 'Transfer')?.args[2] as BN;

        weth = await WETH9.deployed();
        aavePool = await MockAavePool.deployed();
        arbitrage = await WasabiOptionArbitrage.deployed();
        marketplace = await MockMarketplace.deployed();

        await arbitrage.setOption(option.address);

        await web3.eth.sendTransaction({ from: lp, to: aavePool.address, value: toEth(initialFlashLoanPoolBalance) })

        // Send 10 WETH to the marketplace
        await weth.deposit(metadata(lp, 20));
        await weth.transfer(marketplace.address, toEth(20), metadata(lp));

    });

    it("Create Pool", async() => {
        await testNft.setApprovalForAll.sendTransaction(poolFactory.address, true, metadata(lp));
        const createPoolResult =
            await poolFactory.createPool(
                testNft.address,
                [tokenToSell],
                ZERO_ADDRESS,
                metadata(lp));

        truffleAssert.eventEmitted(createPoolResult, "NewPool", null, "Pool wasn't created");
        truffleAssert.eventEmitted(createPoolResult, "OwnershipTransferred", { previousOwner: ZERO_ADDRESS, newOwner: lp }, "Pool didn't change owners correctly");

        const poolAddress = createPoolResult.logs.find(e => e.event === 'NewPool')!.args[0];
        pool = await ETHWasabiPool.at(poolAddress);

        assert.equal(await pool.owner(), lp, "Pool creator and owner not same");
    });
    
    it("Validate option requests", async () => {
        const id = 1;
        let blockNumber = await web3.eth.getBlockNumber();
        let timestamp = Number((await web3.eth.getBlock(blockNumber)).timestamp);
        let expiry = timestamp + duration;
        let orderExpiry = timestamp + duration;
        request = makeRequest(id, pool.address, OptionType.CALL, strikePrice, premium, expiry, tokenToSell.toNumber(), orderExpiry);
    });

    it("Write Option (only owner)", async () => {
        signature = await signPoolAskWithEIP712(request, pool.address, lpPrivateKey);
        const writeOptionResult = await pool.writeOption(request, signature, metadata(buyer, premium));
        truffleAssert.eventEmitted(writeOptionResult, "OptionIssued", null, "Strike price wasn't locked")

        assert.equal(await web3.eth.getBalance(pool.address), toEth(premium), "Incorrect total balance in pool");

        const log = writeOptionResult.logs.find(l => l.event == "OptionIssued")! as Truffle.TransactionLog<OptionIssued>;
        optionId = log.args.optionId;

        assert.equal(await option.ownerOf(optionId), buyer, "Buyer not the owner of option");
        const expectedOptionId = await pool.getOptionIdForToken(request.tokenId);
        assert.equal(expectedOptionId.toNumber(), optionId.toNumber(), "Option of token not correct");
    });


    it("Execute Arb trade", async () => {
        await feeManager.setFraction(200); // Set 2% fee

        await option.setApprovalForAll(arbitrage.address, true, metadata(buyer));

        const price = toEth(13);
        const strike = toEth(strikePrice);
        const strikeWithFee = withFee(toBN(strike));

        await marketplace.setPrice(testNft.address, tokenToSell, price);

        const approveCallData =
            web3.eth.abi.encodeFunctionCall(
                testNft.abi.find(a => a.name === 'approve')!,
                [marketplace.address, tokenToSell.toString()]);
        const approveCall = {
            to: testNft.address,
            value: 0,
            data: approveCallData,
        }

        const sellCallData = 
            web3.eth.abi.encodeFunctionCall(
                marketplace.abi.find(a => a.name === 'sell')!,
                [testNft.address, tokenToSell.toString()]);
        const sellCall = {
            to: marketplace.address,
            value: 0,
            data: sellCallData
        };

        const initialAaveBalance = toBN(await web3.eth.getBalance(aavePool.address));
        const initialUserBalance = toBN(await web3.eth.getBalance(buyer));

        const arbitrageResult = await arbitrage.arbitrage(
            optionId,
            strikeWithFee,
            pool.address,
            tokenToSell,
            [approveCall, sellCall],
            metadata(buyer)
        );

        const premiumEarnedByAave = toBN(strikeWithFee).div(toBN(1000));
        const userProfit = 
            toBN(price)
                .sub(toBN(strikeWithFee))
                .sub(premiumEarnedByAave)
                .sub(gasOfTxn(arbitrageResult.receipt));

        assert.equal(await testNft.ownerOf(tokenToSell), marketplace.address, "Pool didn't receive the NFT");

        assert.equal(
            await web3.eth.getBalance(aavePool.address),
            initialAaveBalance.add(premiumEarnedByAave).toString(),
            "Aave flash loan didn't receive enough"
        );

        assert.equal(
            await web3.eth.getBalance(buyer),
            initialUserBalance.add(userProfit).toString(),
            "User didn't receive enough"
        );
    });
});