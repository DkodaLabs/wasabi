const truffleAssert = require('truffle-assertions');

import { WasabiPoolFactoryInstance, WasabiOptionInstance, TestERC721Instance, ETHWasabiPoolInstance, WasabiOptionArbitrageInstance, MockAavePoolInstance } from "../types/truffle-contracts";
import { OptionExecuted, OptionIssued } from "../types/truffle-contracts/IWasabiPool";
import { PoolAsk, OptionType, ZERO_ADDRESS } from "./util/TestTypes";
import { assertIncreaseInBalance, expectRevertCustomError, gasOfTxn, makeRequest, metadata, signPoolAskWithEIP712, toBN, toEth } from "./util/TestUtils";

const Signing = artifacts.require("Signing");
const WasabiPoolFactory = artifacts.require("WasabiPoolFactory");
const WasabiOption = artifacts.require("WasabiOption");
const ETHWasabiPool = artifacts.require("ETHWasabiPool");
const TestERC721 = artifacts.require("TestERC721");
const WasabiOptionArbitrage = artifacts.require("WasabiOptionArbitrage");
const WETH9 = artifacts.require("WETH9");
const MockAavePool = artifacts.require("MockAavePool");

contract("ConduitSignatureVerifier ERC20", (accounts) => {
    let poolFactory: WasabiPoolFactoryInstance;
    let option: WasabiOptionInstance;
    let testNft: TestERC721Instance;
    let otherToken: BN;
    let tokenToSell: BN;
    let pool: ETHWasabiPoolInstance;
    let optionId: BN;
    let request: PoolAsk;
    let arbitrage: WasabiOptionArbitrageInstance;
    let aavePool: MockAavePoolInstance;

    const lp = accounts[2];
    const buyer = accounts[3];
    const someoneElse = accounts[5];
    const lpPrivateKey = "0dbbe8e4ae425a6d2687f1a7e3ba17bc98c673636790f1b8ad91193c05875ef1";
    const someoneElsePrivateKey = "659cbb0e2411a44db63778987b1e22153c086a95eb6b18bdf89de078917abc63";
    const duration = 10000;

    const initialPoolBalance = 20;
    const strikePrice = 10;
    const premium = 1;

    let signature;

    before("Prepare State", async function () {
        testNft = await TestERC721.deployed();
        await Signing.deployed();
        option = await WasabiOption.deployed();
        poolFactory = await WasabiPoolFactory.deployed();
        await option.toggleFactory(poolFactory.address, true);

        let mintResult = await testNft.mint(metadata(buyer));
        tokenToSell = mintResult.logs.find(e => e.event == 'Transfer')?.args[2] as BN;

        mintResult = await testNft.mint(metadata(someoneElse));
        otherToken = mintResult.logs.find(e => e.event == 'Transfer')?.args[2] as BN;

        await WETH9.deployed();
        aavePool = await MockAavePool.deployed();
        arbitrage = await WasabiOptionArbitrage.deployed();

        await arbitrage.setOption(option.address);

        await web3.eth.sendTransaction({ from: buyer, to: aavePool.address, value: toEth(1) });
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
        await option.setApprovalForAll(arbitrage.address, true, metadata(buyer));

        await arbitrage.arbitrage(
            optionId,
            toEth(1),
            pool.address,
            1,
            [],
            metadata(buyer)
        )
    });
});