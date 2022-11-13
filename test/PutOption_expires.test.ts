const truffleAssert = require('truffle-assertions');

import { WasabiPoolFactoryInstance, WasabiOptionInstance, TestERC721Instance, WasabiPoolInstance } from "../types/truffle-contracts";
import { OptionRequest, OptionType, ZERO_ADDRESS } from "./util/TestTypes";
import { advanceTime, assertIncreaseInBalance, gasOfTxn, makeConfig, makeRequest, metadata, signRequest, toBN, toEth } from "./util/TestUtils";

const Signing = artifacts.require("Signing");
const WasabiPoolFactory = artifacts.require("WasabiPoolFactory");
const WasabiOption = artifacts.require("WasabiOption");
const WasabiPool = artifacts.require("WasabiPool");
const TestERC721 = artifacts.require("TestERC721");

contract("Expiring PutOption execution", accounts => {
    let poolFactory: WasabiPoolFactoryInstance;
    let option: WasabiOptionInstance;
    let testNft: TestERC721Instance;
    let otherToken: BN;
    let tokenToSell: BN;
    let pool: WasabiPoolInstance;
    let optionId: BN | string;
    let request: OptionRequest;

    const lp = accounts[2];
    const buyer = accounts[3];
    const someoneElse = accounts[5];

    const initialPoolBalance = 20;
    const strikePrice = 10;
    const premium = 1;
    const duration = 86400;

    before("Prepare State", async function () {
        testNft = await TestERC721.deployed();//.at("0x3CA35257570F4AAEDFaFeb33181c7c6CbBf5A9F6");
        // await WasabiStructs.deployed();//.at("0xA12120547E3c00d7f1232BFaCbd4e393C0aCDC46");
        await Signing.deployed();//.at("0x43d0BbcE6dF77E786998a3801D213234a7f41214");
        option = await WasabiOption.deployed();//.at("0x6D2C5E0a0FDF44A95699a5EDD73fC81e361a0A66");
        poolFactory = await WasabiPoolFactory.deployed();//.at("0xF03b0a7FAbFfdF0FA79A4Df07A1f9b09c6204d49");
        await option.setFactory(poolFactory.address);

        let mintResult = await testNft.mint(metadata(buyer));
        tokenToSell = mintResult.logs.find(e => e.event == 'Transfer')?.args[2] as BN;

        mintResult = await testNft.mint(metadata(someoneElse));
        otherToken = mintResult.logs.find(e => e.event == 'Transfer')?.args[2] as BN;
    });

    it("Create Pool", async() => {
        const createPoolResult =
            await poolFactory.createPool(
                testNft.address,
                [],
                makeConfig(1, 100, 222, 2630000 /* one month */),
                [OptionType.PUT],
                ZERO_ADDRESS,
                metadata(lp, initialPoolBalance));

        truffleAssert.eventEmitted(createPoolResult, "NewPool", null, "Pool wasn't created");
        truffleAssert.eventEmitted(createPoolResult, "OwnershipTransferred", { previousOwner: ZERO_ADDRESS, newOwner: lp }, "Pool didn't change owners correctly");

        const poolAddress = createPoolResult.logs.find(e => e.event === 'NewPool')!.args[0];
        pool = await WasabiPool.at(poolAddress);

        assert.equal(await pool.owner(), lp, "Pool creator and owner not same");
        assert.equal(await web3.eth.getBalance(pool.address), toEth(initialPoolBalance), "Incorrect total balance in pool");
        assert.equal((await pool.availableBalance()).toString(), toEth(initialPoolBalance), "Incorrect available balance in pool");
    });

    it("Write Option (only owner)", async () => {
        let blockNumber = await web3.eth.getBlockNumber();
        request = makeRequest(pool.address, OptionType.PUT, strikePrice, premium, duration, 0, blockNumber + 5);
        const writeOptionResult = await pool.writeOption(request, await signRequest(request, lp), metadata(buyer, 1));
        truffleAssert.eventEmitted(writeOptionResult, "OptionIssued", null, "Asset wasn't locked");
        await assertIncreaseInBalance(pool.address, toBN(toEth(initialPoolBalance)), toBN(request.premium));

        optionId = writeOptionResult.logs.find(l => l.event == 'OptionIssued')!.args[0];
        assert.equal(await option.ownerOf(optionId), buyer, "Buyer not the owner of option");
    });

    it("Execute Option (option expires)", async () => {
        const availableBalanceBeforeExpiration = await pool.availableBalance();

        await testNft.approve(pool.address, tokenToSell, metadata(buyer));
        await advanceTime(Number(request.duration) * 2);
        await truffleAssert.reverts(
            pool.executeOptionWithSell(optionId, tokenToSell, metadata(buyer)),
            "Option has expired",
            "Expired option cannot be exercised");

        const availableBalanceAfterExpiration = await pool.availableBalance();
        assert.equal(
            availableBalanceAfterExpiration.toString(),
            availableBalanceBeforeExpiration.add(toBN(request.strikePrice)).toString(),
            "Available balance didn't increase after expiration");
    });
    
    it("Withdraw ETH", async () => {
        const lpInitialBalance = toBN(await web3.eth.getBalance(lp));
        const availableBalance = await pool.availableBalance();
        
        await truffleAssert.reverts(
            pool.withdrawETH(availableBalance, metadata(buyer)),
            "caller is not the owner",
            "Only pool owner can withdraw ETH");
        const withdrawETHResult = await pool.withdrawETH(availableBalance, metadata(lp));
        await assertIncreaseInBalance(lp, lpInitialBalance, toBN(availableBalance).sub(gasOfTxn(withdrawETHResult.receipt)));
        assert.equal(await web3.eth.getBalance(pool.address), '0', "Incorrect balance in pool");

        await truffleAssert.reverts(
            pool.withdrawETH(availableBalance, metadata(lp)),
            "Not enough ETH available to withdraw",
            "Cannot withdraw ETH if there is none");
    });
});