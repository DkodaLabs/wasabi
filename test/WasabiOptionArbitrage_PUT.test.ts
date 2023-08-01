const truffleAssert = require('truffle-assertions');

import { WasabiPoolFactoryInstance, WasabiOptionInstance, TestERC721Instance, ETHWasabiPoolInstance, WasabiOptionArbitrageInstance, MockMarketplaceInstance, WETH9Instance, WasabiFeeManagerInstance } from "../types/truffle-contracts";
import { OptionIssued } from "../types/truffle-contracts/IWasabiPool";
import { PoolAsk, OptionType, ZERO_ADDRESS } from "./util/TestTypes";
import { gasOfTxn, getFee, makeRequest, metadata, signFunctionCallData, signPoolAskWithEIP712, toBN, toEth } from "./util/TestUtils";

const WasabiPoolFactory = artifacts.require("WasabiPoolFactory");
const WasabiOption = artifacts.require("WasabiOption");
const ETHWasabiPool = artifacts.require("ETHWasabiPool");
const TestERC721 = artifacts.require("TestERC721");
const WasabiOptionArbitrage = artifacts.require("WasabiOptionArbitrage");
const WETH9 = artifacts.require("WETH9");
const MockMarketplace = artifacts.require("MockMarketplace");
const WasabiFeeManager = artifacts.require("WasabiFeeManager");

contract("WasabiOptionArbitrage PUT", (accounts) => {
    let poolFactory: WasabiPoolFactoryInstance;
    let feeManager: WasabiFeeManagerInstance;
    let option: WasabiOptionInstance;
    let testNft: TestERC721Instance;
    let otherToken: BN;
    let tokenToSell: BN;
    let marketplaceToken: BN;
    let pool: ETHWasabiPoolInstance;
    let optionId: BN;
    let request: PoolAsk;
    let arbitrage: WasabiOptionArbitrageInstance;
    let marketplace: MockMarketplaceInstance;
    let weth: WETH9Instance;

    const deployer = accounts[0];
    const lp = accounts[2];
    const buyer = accounts[3];
    const someoneElse = accounts[5];
    const lpPrivateKey = "0dbbe8e4ae425a6d2687f1a7e3ba17bc98c673636790f1b8ad91193c05875ef1";
    const someoneElsePrivateKey = "659cbb0e2411a44db63778987b1e22153c086a95eb6b18bdf89de078917abc63";
    const duration = 10000;

    const initialPoolBalance = 20;
    const strikePrice = 10;
    const premium = 1;
    const initialFlashLoanPoolBalance = 25;

    let signature;

    before("Prepare State", async function () {
        testNft = await TestERC721.deployed();
        option = await WasabiOption.deployed();
        poolFactory = await WasabiPoolFactory.deployed();
        await option.toggleFactory(poolFactory.address, true);
        feeManager = await WasabiFeeManager.deployed();

        let mintResult = await testNft.mint(metadata(buyer));
        tokenToSell = mintResult.logs.find(e => e.event == 'Transfer')?.args[2] as BN;

        mintResult = await testNft.mint(metadata(someoneElse));
        otherToken = mintResult.logs.find(e => e.event == 'Transfer')?.args[2] as BN;

        weth = await WETH9.deployed();
        marketplace = await MockMarketplace.deployed();
        arbitrage = await WasabiOptionArbitrage.new(option.address, weth.address);

        await web3.eth.sendTransaction({ from: lp, to: arbitrage.address, value: toEth(initialFlashLoanPoolBalance) })

        // Send 10 WETH to the marketplace
        await weth.deposit(metadata(lp, 10));
        await weth.transfer(marketplace.address, toEth(10), metadata(lp));

    });

    it("Create Pool", async() => {
        const createPoolResult =
            await poolFactory.createPool(
                testNft.address,
                [],
                ZERO_ADDRESS,
                metadata(lp, initialPoolBalance));

        truffleAssert.eventEmitted(createPoolResult, "NewPool", null, "Pool wasn't created");
        truffleAssert.eventEmitted(createPoolResult, "OwnershipTransferred", { previousOwner: ZERO_ADDRESS, newOwner: lp }, "Pool didn't change owners correctly");

        const poolAddress = createPoolResult.logs.find(e => e.event === 'NewPool')!.args[0];
        pool = await ETHWasabiPool.at(poolAddress);

        assert.equal(await pool.owner(), lp, "Pool creator and owner not same");
        assert.equal(await web3.eth.getBalance(pool.address), toEth(initialPoolBalance), "Incorrect total balance in pool");
        assert.equal((await pool.availableBalance()).toString(), toEth(initialPoolBalance), "Incorrect available balance in pool");
    });
    
    it("Validate option requests", async () => {
        const id = 1;
        let blockNumber = await web3.eth.getBlockNumber();
        let timestamp = Number((await web3.eth.getBlock(blockNumber)).timestamp);
        let expiry = timestamp + duration;
        let orderExpiry = timestamp + duration;
        request = makeRequest(id, pool.address, OptionType.PUT, strikePrice, premium, expiry, 0, orderExpiry);
    });

    it("Write Option (only owner)", async () => {
        signature = await signPoolAskWithEIP712(request, pool.address, lpPrivateKey);
        const writeOptionResult = await pool.writeOption(request, signature, metadata(buyer, premium));
        truffleAssert.eventEmitted(writeOptionResult, "OptionIssued", null, "Strike price wasn't locked")

        assert.equal(await web3.eth.getBalance(pool.address), toEth(initialPoolBalance + premium), "Incorrect total balance in pool");
        assert.equal(
            (await pool.availableBalance()).toString(),
            toEth(initialPoolBalance - strikePrice + premium),
            "Incorrect available balance in pool");

        const log = writeOptionResult.logs.find(l => l.event == "OptionIssued")! as Truffle.TransactionLog<OptionIssued>;
        optionId = log.args.optionId;
        assert.equal(await option.ownerOf(optionId), buyer, "Buyer not the owner of option");
    });


    it("Execute Arb trade", async () => {
        await feeManager.setFraction(200); // Set 2% fee
        await option.setApprovalForAll(arbitrage.address, true, metadata(buyer));

        const mintResult = await testNft.mint(metadata(lp));
        const marketplaceToken = mintResult.logs.find(e => e.event == 'Transfer')?.args[2] as BN;
        await testNft.transferFrom(lp, marketplace.address, marketplaceToken, metadata(lp));
        const price = toEth(7);

        await marketplace.setPrice(testNft.address, marketplaceToken, price);

        const data = 
            web3.eth.abi.encodeFunctionCall(
                marketplace.abi.find(a => a.name === 'buy')!,
                [testNft.address, marketplaceToken.toString()]);
        const functionCall = {
            to: marketplace.address,
            value: price,
            data
        };

        const initialArbBalance = toBN(await web3.eth.getBalance(arbitrage.address));
        const initialUserBalance = toBN(await web3.eth.getBalance(buyer));

        const signature = await signFunctionCallData(functionCall, deployer);
        const arbitrageResult = await arbitrage.arbitrage(
            optionId,
            price,
            pool.address,
            marketplaceToken,
            [functionCall],
            [signature],
            metadata(buyer)
        );

        await truffleAssert.reverts(
            arbitrage.arbitrage(
                optionId,
                price,
                pool.address,
                marketplaceToken,
                [functionCall],
                [signature, signature],
                metadata(buyer)),
            "Length is invalid",
            "Length is invalid");

        const strike = toBN(toEth(strikePrice));
        const protocolFee = getFee(strike);

        const premiumEarnedByArbitrage =
            toBN(price)
                .mul(toBN(9))
                .div(toBN(10_000));
        const userProfit = 
            strike
                .sub(protocolFee)
                .sub(toBN(price))
                .sub(premiumEarnedByArbitrage)
                .sub(gasOfTxn(arbitrageResult.receipt));

        assert.equal(await testNft.ownerOf(marketplaceToken), pool.address, "Pool didn't receive the NFT");

        assert.equal(
            await web3.eth.getBalance(arbitrage.address),
            initialArbBalance.add(premiumEarnedByArbitrage).toString(),
            "Arbitrage flash loan didn't receive enough"
        );

        assert.equal(
            await web3.eth.getBalance(buyer),
            initialUserBalance.add(userProfit).toString(),
            "User didn't receive enough"
        );
    });
});