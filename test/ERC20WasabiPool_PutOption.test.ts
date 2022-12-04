const truffleAssert = require('truffle-assertions');

import { 
    WasabiPoolFactoryInstance,
    WasabiOptionInstance,
    TestERC721Instance,
    ETHWasabiPoolInstance,
    WasabiDemoTokenInstance
} from "../types/truffle-contracts";
import { OptionExecuted, OptionIssued } from "../types/truffle-contracts/WasabiPool";
import { OptionRequest, OptionType, ZERO_ADDRESS } from "./util/TestTypes";
import { assertIncreaseInBalance, gasOfTxn, makeConfig, makeRequest, metadata, signRequest, toBN, toEth } from "./util/TestUtils";

const Signing = artifacts.require("Signing");
const WasabiPoolFactory = artifacts.require("WasabiPoolFactory");
const WasabiOption = artifacts.require("WasabiOption");
const ETHWasabiPool = artifacts.require("ETHWasabiPool");
const TestERC721 = artifacts.require("TestERC721");
const WasabiDemoToken = artifacts.require("WasabiDemoToken");

contract("Erc20WasabiPool: PutOption", accounts => {
    let token: WasabiDemoTokenInstance;
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

    const initialPoolBalance = 20;
    const strikePrice = 10;
    const premium = 1;

    before("Prepare State", async function () {
        token = await WasabiDemoToken.deployed();

        testNft = await TestERC721.deployed();
        await Signing.deployed();
        option = await WasabiOption.deployed();
        poolFactory = await WasabiPoolFactory.deployed();
        await option.setFactory(poolFactory.address);

        let mintResult = await testNft.mint(metadata(buyer));
        tokenToSell = mintResult.logs.find(e => e.event == 'Transfer')?.args[2] as BN;

        mintResult = await testNft.mint(metadata(someoneElse));
        otherToken = mintResult.logs.find(e => e.event == 'Transfer')?.args[2] as BN;

        await token.mint(metadata(buyer));
        await token.mint(metadata(lp));
    });

    it("Create Pool", async() => {
        await token.approve(poolFactory.address, toEth(initialPoolBalance), metadata(lp));
        const createPoolResult =
            await poolFactory.createERC20Pool(
                token.address,
                toBN(toEth(initialPoolBalance)),
                testNft.address,
                [],
                makeConfig(1, 100, 222, 2630000 /* one month */),
                [OptionType.PUT],
                ZERO_ADDRESS,
                metadata(lp));

        truffleAssert.eventEmitted(createPoolResult, "NewPool", null, "Pool wasn't created");
        truffleAssert.eventEmitted(createPoolResult, "OwnershipTransferred", { previousOwner: ZERO_ADDRESS, newOwner: lp }, "Pool didn't change owners correctly");

        const poolAddress = createPoolResult.logs.find(e => e.event === 'NewPool')!.args[0];
        pool = await ETHWasabiPool.at(poolAddress);

        assert.equal(await pool.owner(), lp, "Pool creator and owner not same");
        assert.equal((await token.balanceOf(pool.address)).toString(), toEth(initialPoolBalance), "Incorrect total balance in pool");
        assert.equal((await pool.availableBalance()).toString(), toEth(initialPoolBalance), "Incorrect available balance in pool");

        assert.equal(await pool.getLiquidityAddress(), token.address, 'Token not correct');
    });
    
    it("Validate option requests", async () => {
        let blockNumber = await web3.eth.getBlockNumber();
        let maxBlockToExecute = blockNumber + 2;

        request = makeRequest(pool.address, OptionType.PUT, 10, premium, 263000, 1001, maxBlockToExecute); // no premium in request
        await truffleAssert.reverts(
            pool.writeOption.sendTransaction(request, await signRequest(request, lp), metadata(buyer)),
            "Not enough premium is supplied",
            "No permission given to transfer enough tokens");

        await token.approve(pool.address, toEth(premium), metadata(buyer));

        maxBlockToExecute = blockNumber - 2;
        request = makeRequest(pool.address, OptionType.PUT, 0, premium, 263000, 1001, maxBlockToExecute); // no strike price in request
        await truffleAssert.reverts(
            pool.writeOption(request, await signRequest(request, lp), metadata(buyer)),
            "Max block to execute has passed",
            "Max block to execute has passed");

        maxBlockToExecute = blockNumber + 5;

        request = makeRequest(pool.address, OptionType.PUT, 0, premium, 263000, 0, maxBlockToExecute); // no strike price in request
        await truffleAssert.reverts(
            pool.writeOption.sendTransaction(request, await signRequest(request, lp), metadata(buyer)),
            "Strike price must be set",
            "Strike price must be set");
        
        request = makeRequest(pool.address, OptionType.PUT, strikePrice, 0, 263000, 0, maxBlockToExecute); // no premium in request
        await truffleAssert.reverts(
            pool.writeOption.sendTransaction(request, await signRequest(request, lp), metadata(buyer)),
            "Not enough premium is supplied",
            "Cannot write option when premium is 0");

        request = makeRequest(pool.address, OptionType.CALL, strikePrice, premium, 263000, 0, maxBlockToExecute); // only PUT allowed
        await truffleAssert.reverts(
            pool.writeOption.sendTransaction(request, await signRequest(request, lp), metadata(buyer)),
            "Option type is not allowed",
            "Cannot write CALL options");

        request = makeRequest(pool.address, OptionType.PUT, initialPoolBalance * 5, premium, 263000, 0, maxBlockToExecute); // strike price too high
        await truffleAssert.reverts(
            pool.writeOption.sendTransaction(request, await signRequest(request, lp), metadata(buyer)),
            "Not enough ETH available to lock",
            "Cannot write option strike price is higher than available balance");

        request = makeRequest(pool.address, OptionType.PUT, strikePrice, premium * 2, 263000, 0, maxBlockToExecute);
        await truffleAssert.reverts(
            pool.writeOption.sendTransaction(request, await signRequest(request, lp), metadata(buyer)), // not sending enough premium
            "Not enough premium is supplied",
            "Premium paid doesn't match the premium of the request");

        request = makeRequest(pool.address, OptionType.PUT, strikePrice, premium, 263000, 0, maxBlockToExecute);

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
        const writeOptionResult = await pool.writeOption(request, await signRequest(request, lp), metadata(buyer));
        truffleAssert.eventEmitted(writeOptionResult, "OptionIssued", null, "Strike price wasn't locked")

        assert.equal((await token.balanceOf(pool.address)).toString(), toEth(initialPoolBalance + premium), "Incorrect total balance in pool");
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

        const initialBuyerBalance = await token.balanceOf(buyer);
        const executeOptionWithSellResult = await pool.executeOptionWithSell(optionId, tokenToSell, metadata(buyer));
        const finalBuyerBalance = await token.balanceOf(buyer);
        assert.equal(
            finalBuyerBalance.toString(),
            initialBuyerBalance.add(toBN(request.strikePrice)).toString(),
            "Option buyer didn't get enough");

        const log = executeOptionWithSellResult.logs.find(l => l.event == "OptionExecuted")! as Truffle.TransactionLog<OptionExecuted>;
        const expectedOptionId = log.args.optionId;
        assert.equal(expectedOptionId.toString(), optionId.toString(), "Option wasn't executed");
        assert.equal((await token.balanceOf(pool.address)).toString(), toEth(initialPoolBalance - strikePrice + premium), "Incorrect total balance in pool");
        assert.equal((await pool.availableBalance()).toString(), toEth(initialPoolBalance - strikePrice + premium), "Incorrect available balance in pool");
        assert.equal(await testNft.ownerOf(tokenToSell), pool.address, "Pool didn't get NFT");
        await truffleAssert.reverts(option.ownerOf(optionId), "ERC721: invalid token ID", "Option NFT not burned after execution");
    });

    it("Withdraw ETH", async () => {
        const value = toBN(toEth(5));
        await web3.eth.sendTransaction({from: lp, to: pool.address, value: value});
        await truffleAssert.reverts(
            pool.withdrawETH(value, metadata(buyer)),
            "caller is not the owner",
            "Only pool owner can withdraw ETH");
        const initialBalance = toBN(await web3.eth.getBalance(lp));
        const withdrawETHResult = await pool.withdrawETH(value, metadata(lp));
        await assertIncreaseInBalance(lp, initialBalance, value.sub(gasOfTxn(withdrawETHResult.receipt)));
        assert.equal(await web3.eth.getBalance(pool.address), '0', "Incorrect balance in pool");
    });

    it("Withdraw ERC20", async () => {
        const availablePoolBalance = await pool.availableBalance();
        await truffleAssert.reverts(
            pool.withdrawERC20(token.address, availablePoolBalance, metadata(buyer)),
            "caller is not the owner",
            "Only pool owner can withdraw ETH");

        const initialLpBlanace = await token.balanceOf(lp);
        await pool.withdrawERC20(token.address, availablePoolBalance, metadata(lp));
        const finalLpBlanace = await token.balanceOf(lp);
        assert.equal(finalLpBlanace.toString(), initialLpBlanace.add(availablePoolBalance).toString(), "Not enough withdrawn");
        assert.equal((await pool.availableBalance()).toString(), '0', "Incorrect balance in pool");
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