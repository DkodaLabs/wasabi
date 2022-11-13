const truffleAssert = require('truffle-assertions');

import { WasabiPoolFactoryInstance, WasabiOptionInstance, TestERC721Instance, WasabiPoolInstance } from "../types/truffle-contracts";
import { OptionRequest, OptionType, ZERO_ADDRESS } from "./util/TestTypes";
import { assertIncreaseInBalance, gasOfTxn, makeConfig, makeRequest, metadata, signRequest, toBN, toEth } from "./util/TestUtils";

const Signing = artifacts.require("Signing");
const WasabiPoolFactory = artifacts.require("WasabiPoolFactory");
const WasabiOption = artifacts.require("WasabiOption");
const WasabiPool = artifacts.require("WasabiPool");
const TestERC721 = artifacts.require("TestERC721");

contract("PutOption", accounts => {
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
    
    it("Validate option requests", async () => {
        let blockNumber = await web3.eth.getBlockNumber();
        let maxBlockToExecute = blockNumber - 2;

        request = makeRequest(pool.address, OptionType.CALL, 0, 1, 263000, 1001, maxBlockToExecute); // no strike price in request
        await truffleAssert.reverts(
            pool.writeOption(request, await signRequest(request, lp), metadata(buyer, 1)),
            "Max block to execute has passed",
            "Max block to execute has passed");

        maxBlockToExecute = blockNumber + 5;

        request = makeRequest(pool.address, OptionType.PUT, 0, premium, 263000, 0, maxBlockToExecute); // no strike price in request
        await truffleAssert.reverts(
            pool.writeOption.sendTransaction(request, await signRequest(request, lp), metadata(buyer, premium)),
            "Strike price must be set",
            "Strike price must be set");
        
        request = makeRequest(pool.address, OptionType.PUT, strikePrice, 0, 263000, 0, maxBlockToExecute); // no premium in request
        await truffleAssert.reverts(
            pool.writeOption.sendTransaction(request, await signRequest(request, lp), metadata(buyer)),
            "Not enough premium is supplied",
            "Cannot write option when premium is 0");

        request = makeRequest(pool.address, OptionType.CALL, strikePrice, premium, 263000, 0, maxBlockToExecute); // only PUT allowed
        await truffleAssert.reverts(
            pool.writeOption.sendTransaction(request, await signRequest(request, lp), metadata(buyer, premium)),
            "Option type is not allowed",
            "Cannot write CALL options");

        request = makeRequest(pool.address, OptionType.PUT, initialPoolBalance * 5, premium, 263000, 0, maxBlockToExecute); // strike price too high
        await truffleAssert.reverts(
            pool.writeOption.sendTransaction(request, await signRequest(request, lp), metadata(buyer, premium)),
            "Not enough ETH available to lock",
            "Cannot write option strike price is higher than available balance");

        request = makeRequest(pool.address, OptionType.PUT, strikePrice, premium, 263000, 0, maxBlockToExecute);
        await truffleAssert.reverts(
            pool.writeOption.sendTransaction(request, await signRequest(request, lp), metadata(buyer, premium / 2)), // not sending enough premium
            "Not enough premium is supplied",
            "Premium paid doesn't match the premium of the request");

        await truffleAssert.reverts(
            pool.writeOption.sendTransaction(request, await signRequest(request, buyer), metadata(buyer, premium)),
            "Signature not valid",
            "Only caller or admin can issue options");

        const request2 = makeRequest(pool.address, OptionType.PUT, strikePrice, 0.1, 263000, 0, maxBlockToExecute);
        await truffleAssert.reverts(
            pool.writeOption.sendTransaction(request2, await signRequest(request, lp), metadata(buyer, premium)),
            "Signature not valid",
            "Signed object and provided object are different");
    });

    it("Write Option (only owner)", async () => {
        const writeOptionResult = await pool.writeOption(request, await signRequest(request, lp), metadata(buyer, premium));
        truffleAssert.eventEmitted(writeOptionResult, "OptionIssued", null, "Strike price wasn't locked")

        assert.equal(await web3.eth.getBalance(pool.address), toEth(initialPoolBalance + premium), "Incorrect total balance in pool");
        assert.equal(
            (await pool.availableBalance()).toString(),
            toEth(initialPoolBalance - strikePrice + premium),
            "Incorrect available balance in pool");

        optionId = writeOptionResult.logs.find(e => e.event === 'OptionIssued')!.args[0];
        assert.equal(await option.ownerOf(optionId), buyer, "Buyer not the owner of option");
    });
    
    it("Execute Option (only option holder)", async () => {
        assert.equal(await testNft.ownerOf(tokenToSell), buyer, "MP is not the owner of token to sell");
        await testNft.approve(pool.address, tokenToSell, metadata(buyer));

        await truffleAssert.reverts(
            pool.executeOptionWithSell.sendTransaction(optionId, tokenToSell, metadata(someoneElse)),
            "Only the token owner can execute the option",
            "Non option holder can't execute the option");
        await truffleAssert.reverts(
            pool.executeOptionWithSell.sendTransaction(optionId, otherToken, metadata(buyer)),
            "Need to own the token to sell in order to execute a PUT option",
            "Cannot execute PUT and sell someone else's asset");

        let initialBalance = toBN(await web3.eth.getBalance(buyer));
        const executeOptionWithSellResult = await pool.executeOptionWithSell(optionId, tokenToSell, metadata(buyer));
        await assertIncreaseInBalance(
            buyer,
            initialBalance,
            toBN(toEth(strikePrice)).sub(gasOfTxn(executeOptionWithSellResult.receipt)));
        assert.equal(executeOptionWithSellResult.logs.find(e => e.event == 'OptionExecuted')?.args[0].toString(), `${optionId}`, "Option wasn't executed");
        assert.equal(await web3.eth.getBalance(pool.address), toEth(initialPoolBalance - strikePrice + premium), "Incorrect total balance in pool");
        assert.equal((await pool.availableBalance()).toString(), toEth(initialPoolBalance - strikePrice + premium), "Incorrect available balance in pool");
        assert.equal(await testNft.ownerOf(tokenToSell), pool.address, "Pool didn't get NFT");
        await truffleAssert.reverts(option.ownerOf(optionId), "ERC721: invalid token ID", "Option NFT not burned after execution");
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

    it("Withdraw ERC721", async () => {
        await truffleAssert.reverts(
            pool.withdrawERC721.sendTransaction(testNft.address, [otherToken], metadata(lp)),
            "Token is not in the pool",
            "Token is not in the pool");
        await truffleAssert.reverts(
            pool.withdrawERC721.sendTransaction(testNft.address, [tokenToSell], {from: buyer}),
            "caller is not the owner",
            "Only pool owner can withdraw assets");
        await pool.withdrawERC721.sendTransaction(testNft.address, [tokenToSell], metadata(lp))
        assert.equal(await testNft.ownerOf(tokenToSell), lp, "Pool owner didn't receive withdrawn NFT");
    });
});