const truffleAssert = require('truffle-assertions');

import { toEth, toBN, makeRequest, makeConfig, metadata, signRequest, gasOfTxn, assertIncreaseInBalance } from "./util/TestUtils";
import { OptionRequest, OptionType, ZERO_ADDRESS } from "./util/TestTypes";
import { TestERC721Instance } from "../types/truffle-contracts/TestERC721.js";
import { WasabiPoolFactoryInstance } from "../types/truffle-contracts/WasabiPoolFactory.js";
import { WasabiOptionInstance } from "../types/truffle-contracts/WasabiOption.js";
import { WasabiPoolInstance } from "../types/truffle-contracts/WasabiPool.js";

const Signing = artifacts.require("Signing");
const WasabiPoolFactory = artifacts.require("WasabiPoolFactory");
const WasabiOption = artifacts.require("WasabiOption");
const WasabiPool = artifacts.require("WasabiPool");
const TestERC721 = artifacts.require("TestERC721");

contract("CallOption", accounts => {
    let poolFactory: WasabiPoolFactoryInstance;
    let option: WasabiOptionInstance;
    let testNft: TestERC721Instance;
    let poolAddress: string;
    let pool: WasabiPoolInstance;
    let optionId: BN | string;
    let request: OptionRequest;

    const lp = accounts[2];
    const buyer = accounts[3];
    const admin = accounts[4]; // Dkoda
    const someoneElse = accounts[5];

    before("Prepare State", async function () {
        testNft = await TestERC721.deployed();//.at("0x3CA35257570F4AAEDFaFeb33181c7c6CbBf5A9F6");
        // await WasabiStructs.deployed();//.at("0xA12120547E3c00d7f1232BFaCbd4e393C0aCDC46");
        await Signing.deployed();//.at("0x43d0BbcE6dF77E786998a3801D213234a7f41214");
        option = await WasabiOption.deployed();//.at("0x6D2C5E0a0FDF44A95699a5EDD73fC81e361a0A66");
        poolFactory = await WasabiPoolFactory.deployed();//.at("0xF03b0a7FAbFfdF0FA79A4Df07A1f9b09c6204d49");
        await option.setFactory(poolFactory.address);

        await testNft.mint(metadata(lp));
        await testNft.mint(metadata(lp));
        await testNft.mint(metadata(lp));
        await testNft.mint(metadata(someoneElse));
        await testNft.mint(metadata(buyer));
        await testNft.mint(metadata(buyer));
    });
    
    it("1. Create Pool", async () => {
        await testNft.setApprovalForAll.sendTransaction(poolFactory.address, true, {from: lp});

        const config = makeConfig(1, 100, 222, 2630000 /* one month */);
        const types = [OptionType.CALL];
        const createPoolResult = await poolFactory.createPool(testNft.address, [1001, 1002, 1003], config, types, {from: lp});
        truffleAssert.eventEmitted(createPoolResult, "NewPool", null, "Pool wasn't created");
        truffleAssert.eventEmitted(createPoolResult, "OwnershipTransferred", { previousOwner: ZERO_ADDRESS, newOwner: lp }, "Pool didn't change owners correctly");

        poolAddress = createPoolResult.logs.find(e => e.event == "NewPool")!.args[0];
        pool = await WasabiPool.at(poolAddress);
        assert.equal(await pool.owner(), lp, "Pool creator and owner not same");
        assert.deepEqual((await pool.getAllTokenIds()).map(a => a.toNumber()), [1001, 1002, 1003], "Pool doesn't have the correct tokens");
    });
    
    it("2. Validate Option Requests", async () => {
        request = makeRequest(pool.address, OptionType.CALL, 0, 1, 263000, 1001); // no strike price in request
        await truffleAssert.reverts(
            pool.writeOption(request, await signRequest(request, lp), metadata(buyer, 1)),
            "Strike price must be set",
            "Strike price must be set");
        
        request = makeRequest(pool.address, OptionType.CALL, 10, 0, 263000, 1001); // no premium in request
        await truffleAssert.reverts(
            pool.writeOption.sendTransaction(request, await signRequest(request, lp), metadata(buyer)),
            "Not enough premium is supplied",
            "Cannot write option when premium is 0");

        request = makeRequest(pool.address, OptionType.CALL, 10, 1, 263000, 1001);
        await truffleAssert.reverts(
            pool.writeOption.sendTransaction(request, await signRequest(request, lp), metadata(buyer, 0.5)), // not sending enough premium
            "Not enough premium is supplied",
            "Premium paid doesn't match the premium of the request");

        const request2 = makeRequest(pool.address, OptionType.CALL, 9, 1, 263000, 1001);
        await truffleAssert.reverts(
            pool.writeOption.sendTransaction(request, await signRequest(request2, someoneElse), metadata(buyer, 1)),
            "Signature not valid",
            "Signed object and provided object are different");
    });

    it("3. Write Option (only owner)", async () => {
        const writeOptionResult = await pool.writeOption(request, await signRequest(request, lp), metadata(buyer, 1));
        truffleAssert.eventEmitted(writeOptionResult, "OptionIssued", {lockedTokenId: toBN(request.tokenId)}, "Asset wasn't locked");
        assert.equal(await web3.eth.getBalance(pool.address), request.premium, "Incorrect balance in pool");

        optionId = writeOptionResult.logs.find(l => l.event == 'OptionIssued')!.args[0];
        assert.equal(await option.ownerOf(optionId), buyer, "Buyer not the owner of option");

        await truffleAssert.reverts(
            pool.writeOption.sendTransaction(request, await signRequest(request, lp), metadata(buyer, 1)),
            "Token is locked or is not in the pool",
            "Cannot (re)write an option for a locked asset");
    });

    it("4. Execute Option (only option holder)", async () => {
        await truffleAssert.reverts(
            pool.executeOption.sendTransaction(optionId, metadata(someoneElse, 10)),
            "Only the token owner can execute the option",
            "Non option holder can't execute the option");
        await truffleAssert.reverts(
            pool.executeOption.sendTransaction(optionId, metadata(buyer, 5)),
            "Strike price needs to be supplied to execute a CALL option",
            "Strike price needs to be supplied to execute a CALL option");
        const executeOptionResult = await pool.executeOption(optionId, metadata(buyer, 10));

        assert.equal(executeOptionResult.logs.find(e => e.event == 'OptionExecuted')?.args[0].toString(), `${optionId}`, "Option wasn't executed");
        assert.equal(await testNft.ownerOf(request.tokenId), buyer, "Option executor didn't get NFT");
        assert.equal(await web3.eth.getBalance(pool.address), toEth(10 + 1), "Incorrect balance in pool");
        await truffleAssert.reverts(option.ownerOf(optionId), "ERC721: invalid token ID", "Option NFT not burned after execution");
    });
    
    it("5. Issue Option & Send/Sell Back to Pool", async () => {
        let initialPoolBalance = toBN(await web3.eth.getBalance(pool.address));
        assert.deepEqual((await pool.getAllTokenIds()).map(a => a.toNumber()), [1003, 1002], "Pool doesn't have the correct tokens");

        request = makeRequest(pool.address, OptionType.CALL, 10, 1, 263000, 1002);
        const writeOptionResult = await pool.writeOption(request, await signRequest(request, lp), metadata(buyer, 1));
        truffleAssert.eventEmitted(writeOptionResult, "OptionIssued", {lockedTokenId: toBN(request.tokenId)}, "Asset wasn't locked");
        assert.equal(
            await web3.eth.getBalance(pool.address),
            initialPoolBalance.add(toBN(request.premium)).toString(),
            "Incorrect balance in pool");

        const optionId = writeOptionResult.logs.find(e => e.event === 'OptionIssued')!.args[0];
        assert.equal(await option.ownerOf(optionId), buyer, "Buyer not the owner of option");

        await option.methods["safeTransferFrom(address,address,uint256)"](buyer, pool.address, optionId, metadata(buyer));

        await truffleAssert.reverts(pool.getOptionData(optionId), "Option doesn't belong to this pool", "Option data not cleared correctly");
        await truffleAssert.reverts(option.ownerOf(optionId), "ERC721: invalid token ID", "Option NFT not burned after execution");
    });

    it("6. Withdraw ERC721", async () => {
        await truffleAssert.reverts(
            pool.withdrawERC721.sendTransaction(testNft.address, [1001], {from: lp}),
            "Token is locked or is not in the pool",
            "Token is locked or is not in the pool");
        await truffleAssert.reverts(
            pool.withdrawERC721.sendTransaction(testNft.address, [1002], {from: buyer}),
            "caller is not the owner",
            "Only pool owner can withdraw assets");
        await pool.withdrawERC721.sendTransaction(testNft.address, [1002, 1003], {from: lp})
        assert.equal(await testNft.ownerOf(1002), lp, "Pool owner didn't receive withdrawn NFT");
        assert.equal(await testNft.ownerOf(1003), lp, "Pool owner didn't receive withdrawn NFT");
    });

    it("7. Withdraw ETH", async () => {
        const availablePoolBalance = await pool.availableBalance();
        await truffleAssert.reverts(
            pool.withdrawETH.sendTransaction({from: buyer}),
            "caller is not the owner",
            "Only pool owner can withdraw ETH");
        const initialBalance = toBN(await web3.eth.getBalance(lp));
        const withdrawETHResult = await pool.withdrawETH({from: lp});
        await assertIncreaseInBalance(lp, initialBalance, availablePoolBalance.sub(gasOfTxn(withdrawETHResult.receipt)));
        assert.equal(await web3.eth.getBalance(pool.address), '0', "Incorrect balance in pool");
    });
    
    it("Covered Call Option end-to-end (with admin)", async () => {
        await testNft.setApprovalForAll.sendTransaction(poolFactory.address, true, metadata(lp));

        // 1. Liquidity Provider Creates Pool
        const config = makeConfig(1, 100, 222, 2630000 /* one month */);
        const types = [OptionType.CALL];
        const createPoolResult = await poolFactory.createPool(testNft.address, [1002, 1003], config, types, metadata(lp));
        truffleAssert.eventEmitted(createPoolResult, "NewPool", null, "Pool wasn't created");
        truffleAssert.eventEmitted(createPoolResult, "OwnershipTransferred", { previousOwner: ZERO_ADDRESS, newOwner: lp }, "Pool didn't change owners correctly");

        const poolAddress = createPoolResult.logs.find(e => e.event == "NewPool")!.args[0];
        const pool = await WasabiPool.at(poolAddress);
        assert.equal(await pool.owner(), lp, "Pool creator and owner not same");

        // 2. Set admin (only owner can)
        await truffleAssert.reverts(pool.setAdmin.sendTransaction(admin), "caller is not the owner", "Only owner can change the admin.");
        await truffleAssert.reverts(pool.removeAdmin.sendTransaction(), "caller is not the owner", "Only owner can change the admin.");
        const setAdminResult = await pool.setAdmin(admin, {from: lp});
        truffleAssert.eventEmitted(setAdminResult, "AdminChanged", {admin: admin}, "Admin wasn't changed");
        
        // 3. Write option (only owner or admin)
        let request = makeRequest(poolAddress, OptionType.CALL, 0, 1, 263000, 1002); // no strike price in request
        await truffleAssert.reverts(
            pool.writeOption.sendTransaction(request, await signRequest(request, admin), metadata(buyer, 1)),
            "Strike price must be set",
            "Strike price must be set");
        
        request = makeRequest(poolAddress, OptionType.CALL, 10, 0, 263000, 1002); // no premium in request
        await truffleAssert.reverts(
            pool.writeOption.sendTransaction(request, await signRequest(request, admin), metadata(buyer)),
            "Not enough premium is supplied",
            "Cannot write option when premium is 0");

        request = makeRequest(poolAddress, OptionType.CALL, 10, 1, 263000, 1002); // not sending enough premium
        await truffleAssert.reverts(
            pool.writeOption.sendTransaction(request, await signRequest(request, admin), metadata(buyer, 0.5)), // not sending enough premium
            "Not enough premium is supplied",
            "Premium paid doesn't match the premium of the request");

        await truffleAssert.reverts(
            pool.writeOption.sendTransaction(request, await signRequest(request, buyer), metadata(buyer, 1)),
            "Signature not valid",
            "Only caller or admin can issue options");

        const request2 = makeRequest(poolAddress, OptionType.CALL, 9, 1, 263000, 1002);
        await truffleAssert.reverts(
            pool.writeOption.sendTransaction(request, await signRequest(request2, admin), metadata(buyer, 1)),
            "Signature not valid",
            "Signed object and provided object are different");

        const writeOptionResult = await pool.writeOption(request, await signRequest(request, admin), metadata(buyer, 1));
        truffleAssert.eventEmitted(writeOptionResult, "OptionIssued", {lockedTokenId: toBN(request.tokenId)}, "Asset wasn't locked");
        assert.equal(await web3.eth.getBalance(poolAddress), request.premium, "Incorrect balance in pool");

        const optionId = writeOptionResult.logs.find(e => e.event === 'OptionIssued')!.args[0];
        assert.equal(await option.ownerOf(optionId), buyer, "Buyer not the owner of option");

        await truffleAssert.reverts(
            pool.writeOption.sendTransaction(request, await signRequest(request, admin), metadata(buyer, 1)),
            "Token is locked or is not in the pool",
            "Cannot (re)write an option for a locked asset");

        // 4. Execute Option (only option holder)
        await truffleAssert.reverts(
            pool.executeOption.sendTransaction(optionId, metadata(someoneElse, 10)),
            "Only the token owner can execute the option",
            "Non option holder can't execute the option");
        await truffleAssert.reverts(
            pool.executeOption.sendTransaction(optionId, metadata(buyer, 5)),
            "Strike price needs to be supplied to execute a CALL option",
            "Strike price needs to be supplied to execute a CALL option");
        const executeOptionResult = await pool.executeOption(optionId, metadata(buyer, 10));
        assert.equal(executeOptionResult.logs.find(e => e.event == 'OptionExecuted')?.args[0].toString(), `${optionId}`, "Option wasn't executed");
        assert.equal(await testNft.ownerOf(request.tokenId), buyer, "Option executor didn't get NFT");
        assert.equal(await web3.eth.getBalance(poolAddress), toEth(10 + 1), "Incorrect balance in pool");
        await truffleAssert.reverts(option.ownerOf(optionId), "ERC721: invalid token ID", "Option NFT not burned after execution");

        // 5. Withdraw NFTs
        await truffleAssert.reverts(
            pool.withdrawERC721.sendTransaction(testNft.address, [1003], {from: admin}),
            "caller is not the owner",
            "Only pool owner can withdraw assets");

        // 6. Withdraw ETH
        await truffleAssert.reverts(
            pool.withdrawETH.sendTransaction({from: admin}),
            "caller is not the owner",
            "Only pool owner can withdraw ETH");
    });

    it("Covered Put Option end-to-end", async () => {
        const initialPoolBalance: number = 20;
        const strikePrice = 10;
        const premium = 1;

        // 1. Liquidity Provider Creates Pool
        const config = makeConfig(1, 100, 222, 2630000 /* one month */);
        const types = [OptionType.PUT];
        const createPoolResult = await poolFactory.createPool(testNft.address, [], config, types, metadata(lp, initialPoolBalance));
        truffleAssert.eventEmitted(createPoolResult, "NewPool", null, "Pool wasn't created");
        truffleAssert.eventEmitted(createPoolResult, "OwnershipTransferred", { previousOwner: ZERO_ADDRESS, newOwner: lp }, "Pool didn't change owners correctly");
        const poolAddress = createPoolResult.logs.find(e => e.event === 'NewPool')!.args[0];
        const pool: WasabiPoolInstance = await WasabiPool.at(poolAddress);
        assert.equal(await pool.owner(), lp, "Pool creator and owner not same");
        assert.equal(await web3.eth.getBalance(poolAddress), toEth(initialPoolBalance), "Incorrect total balance in pool");
        assert.equal((await pool.availableBalance()).toString(), toEth(initialPoolBalance), "Incorrect available balance in pool");

        // 2. Write option (only owner)
        let request = makeRequest(poolAddress, OptionType.PUT, 0, premium, 263000); // no strike price in request
        await truffleAssert.reverts(
            pool.writeOption.sendTransaction(request, await signRequest(request, lp), metadata(buyer, premium)),
            "Strike price must be set",
            "Strike price must be set");
        
        request = makeRequest(poolAddress, OptionType.PUT, strikePrice, 0, 263000); // no premium in request
        await truffleAssert.reverts(
            pool.writeOption.sendTransaction(request, await signRequest(request, lp), metadata(buyer)),
            "Not enough premium is supplied",
            "Cannot write option when premium is 0");

        request = makeRequest(poolAddress, OptionType.PUT, initialPoolBalance * 5, premium, 263000); // strike price too high
        await truffleAssert.reverts(
            pool.writeOption.sendTransaction(request, await signRequest(request, lp), metadata(buyer, premium)),
            "Not enough ETH available to lock",
            "Cannot write option strike price is higher than available balance");

        request = makeRequest(poolAddress, OptionType.PUT, strikePrice, premium, 263000);
        await truffleAssert.reverts(
            pool.writeOption.sendTransaction(request, await signRequest(request, lp), metadata(buyer, premium / 2)), // not sending enough premium
            "Not enough premium is supplied",
            "Premium paid doesn't match the premium of the request");

        await truffleAssert.reverts(
            pool.writeOption.sendTransaction(request, await signRequest(request, buyer), metadata(buyer, premium)),
            "Signature not valid",
            "Only caller or admin can issue options");

        const request2 = makeRequest(poolAddress, OptionType.PUT, strikePrice, 0.1, 263000);
        await truffleAssert.reverts(
            pool.writeOption.sendTransaction(request2, await signRequest(request, lp), metadata(buyer, premium)),
            "Signature not valid",
            "Signed object and provided object are different");

        const writeOptionResult = await pool.writeOption(request, await signRequest(request, lp), metadata(buyer, premium));
        truffleAssert.eventEmitted(writeOptionResult, "OptionIssued", {lockedTokenId: toBN(request.strikePrice)}, "Strike price wasn't locked")
        assert.equal(await web3.eth.getBalance(poolAddress), toEth(initialPoolBalance + premium), "Incorrect total balance in pool");
        assert.equal(
            (await pool.availableBalance()).toString(),
            toEth(initialPoolBalance - strikePrice + premium),
            "Incorrect available balance in pool");

        const optionId = writeOptionResult.logs.find(e => e.event === 'OptionIssued')!.args[0];
        assert.equal(await option.ownerOf(optionId), buyer, "Buyer not the owner of option");

        // 4. Execute Option (only option holder)
        const tokenToSell = 1005;
        assert.equal(await testNft.ownerOf(tokenToSell), buyer, "MP is not the owner of token to sell");
        await testNft.approve(poolAddress, tokenToSell, metadata(buyer));

        await truffleAssert.reverts(
            pool.executeOptionWithSell.sendTransaction(optionId, tokenToSell, metadata(someoneElse)),
            "Only the token owner can execute the option",
            "Non option holder can't execute the option");
        await truffleAssert.reverts(
            pool.executeOptionWithSell.sendTransaction(optionId, 1004, metadata(buyer)),
            "Need to own the token to sell in order to execute a PUT option",
            "Cannot execute PUT and sell someone else's asset");

        let initialBalance = toBN(await web3.eth.getBalance(buyer));
        const executeOptionWithSellResult = await pool.executeOptionWithSell(optionId, tokenToSell, metadata(buyer));
        await assertIncreaseInBalance(
            buyer,
            initialBalance,
            toBN(toEth(strikePrice)).sub(gasOfTxn(executeOptionWithSellResult.receipt)));
        assert.equal(executeOptionWithSellResult.logs.find(e => e.event == 'OptionExecuted')?.args[0].toString(), `${optionId}`, "Option wasn't executed");
        assert.equal(await web3.eth.getBalance(poolAddress), toEth(initialPoolBalance - strikePrice + premium), "Incorrect total balance in pool");
        assert.equal((await pool.availableBalance()).toString(), toEth(initialPoolBalance - strikePrice + premium), "Incorrect available balance in pool");
        assert.equal(await testNft.ownerOf(tokenToSell), poolAddress, "Pool didn't get NFT");
        await truffleAssert.reverts(option.ownerOf(optionId), "ERC721: invalid token ID", "Option NFT not burned after execution");

        // 5. Withdraw ETH
        await truffleAssert.reverts(
            pool.withdrawETH.sendTransaction({from: buyer}),
            "caller is not the owner",
            "Only pool owner can withdraw ETH");
        initialBalance = toBN(await web3.eth.getBalance(lp));
        const availableBalance = await pool.availableBalance();
        const withdrawETHResult = await pool.withdrawETH({from: lp});
        await assertIncreaseInBalance(lp, initialBalance, toBN(availableBalance).sub(gasOfTxn(withdrawETHResult.receipt)));
        assert.equal(await web3.eth.getBalance(poolAddress), '0', "Incorrect balance in pool");

        await truffleAssert.reverts(
            pool.withdrawETH.sendTransaction({from: lp}),
            "No ETH available to withdraw",
            "Cannot withdraw ETH if there is none");
    });
});
