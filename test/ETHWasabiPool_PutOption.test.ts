const truffleAssert = require('truffle-assertions');

import { WasabiPoolFactoryInstance, WasabiOptionInstance, TestERC721Instance, ETHWasabiPoolInstance } from "../types/truffle-contracts";
import { OptionExecuted, OptionIssued } from "../types/truffle-contracts/IWasabiPool";
import { OptionRequest, OptionType, ZERO_ADDRESS } from "./util/TestTypes";
import { assertIncreaseInBalance, expectRevertCustomError, gasOfTxn, makeConfig, makeRequest, metadata, signRequest, toBN, toEth } from "./util/TestUtils";

const Signing = artifacts.require("Signing");
const WasabiPoolFactory = artifacts.require("WasabiPoolFactory");
const WasabiOption = artifacts.require("WasabiOption");
const ETHWasabiPool = artifacts.require("ETHWasabiPool");
const TestERC721 = artifacts.require("TestERC721");

contract("ETHWasabiPool: PutOption", accounts => {
    let poolFactory: WasabiPoolFactoryInstance;
    let option: WasabiOptionInstance;
    let testNft: TestERC721Instance;
    let otherToken: BN;
    let tokenToSell: BN;
    let pool: ETHWasabiPoolInstance;
    let optionId: BN;
    let request: OptionRequest;

    const lp = accounts[2];
    const buyer = accounts[3];
    const someoneElse = accounts[5];
    const duration = 10000;

    const initialPoolBalance = 20;
    const strikePrice = 10;
    const premium = 1;

    before("Prepare State", async function () {
        testNft = await TestERC721.deployed();
        await Signing.deployed();
        option = await WasabiOption.deployed();
        poolFactory = await WasabiPoolFactory.deployed();
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
        let orderExpiry = timestamp - 1000;

        request = makeRequest(id, pool.address, OptionType.CALL, 0, 1, expiry, 1001, orderExpiry); // no strike price in request
        await truffleAssert.reverts(
            pool.writeOption(request, await signRequest(request, lp), metadata(buyer, 1)),
            "WasabiPool: Order has expired",
            "WasabiPool: Order has expired");

        orderExpiry = timestamp + duration;

        request = makeRequest(id, pool.address, OptionType.PUT, 0, premium, expiry, 0, orderExpiry); // no strike price in request
        await truffleAssert.reverts(
            pool.writeOption.sendTransaction(request, await signRequest(request, lp), metadata(buyer, premium)),
            "Strike price must be set",
            "Strike price must be set");
        
        request = makeRequest(id, pool.address, OptionType.PUT, strikePrice, 0, expiry, 0, orderExpiry); // no premium in request
        await truffleAssert.reverts(
            pool.writeOption.sendTransaction(request, await signRequest(request, lp), metadata(buyer)),
            "Not enough premium is supplied",
            "Cannot write option when premium is 0");

        request = makeRequest(id, pool.address, OptionType.CALL, strikePrice, premium, expiry, 0, orderExpiry); // only PUT allowed
        await truffleAssert.reverts(
            pool.writeOption.sendTransaction(request, await signRequest(request, lp), metadata(buyer, premium)),
            "Option type is not allowed",
            "Cannot write CALL options");

        request = makeRequest(id, pool.address, OptionType.PUT, initialPoolBalance * 5, premium, expiry, 0, orderExpiry); // strike price too high
        await expectRevertCustomError(
            pool.writeOption.sendTransaction(request, await signRequest(request, lp), metadata(buyer, premium)),
            "InsufficientAvailableLiquidity",
            "Cannot write option strike price is higher than available balance");

        request = makeRequest(id, pool.address, OptionType.PUT, strikePrice, premium, expiry, 0, orderExpiry);
        await truffleAssert.reverts(
            pool.writeOption.sendTransaction(request, await signRequest(request, lp), metadata(buyer, premium / 2)), // not sending enough premium
            "Not enough premium is supplied",
            "Premium paid doesn't match the premium of the request");

        await expectRevertCustomError(
            pool.writeOption.sendTransaction(request, await signRequest(request, buyer), metadata(buyer, premium)),
            "InvalidSignature",
            "Only caller or admin can issue options");

        const request2 = makeRequest(id, pool.address, OptionType.PUT, strikePrice, 0.1, expiry, 0, orderExpiry);
        await expectRevertCustomError(
            pool.writeOption.sendTransaction(request2, await signRequest(request, lp), metadata(buyer, premium)),
            "InvalidSignature",
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

        const log = writeOptionResult.logs.find(l => l.event == "OptionIssued")! as Truffle.TransactionLog<OptionIssued>;
        optionId = log.args.optionId;
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

        const log = executeOptionWithSellResult.logs.find(l => l.event == "OptionExecuted")! as Truffle.TransactionLog<OptionExecuted>;
        const expectedOptionId = log.args.optionId;
        assert.equal(expectedOptionId.toString(), optionId.toString(), "Option wasn't executed");
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

        await expectRevertCustomError(
            pool.withdrawETH(availableBalance, metadata(lp)),
            "InsufficientAvailableLiquidity",
            "Cannot withdraw ETH if there is none");
    });

    it("Withdraw ERC721", async () => {
        await expectRevertCustomError(
            pool.withdrawERC721.sendTransaction(testNft.address, [otherToken], metadata(lp)),
            "NftIsInvalid");
        await truffleAssert.reverts(
            pool.withdrawERC721.sendTransaction(testNft.address, [tokenToSell], {from: buyer}),
            "caller is not the owner",
            "Only pool owner can withdraw assets");
        await pool.withdrawERC721.sendTransaction(testNft.address, [tokenToSell], metadata(lp))
        assert.equal(await testNft.ownerOf(tokenToSell), lp, "Pool owner didn't receive withdrawn NFT");
    });
});