const truffleAssert = require('truffle-assertions');

import { toEth, toBN, makeRequest, makeConfig, metadata, signPoolAskWithEIP712, gasOfTxn, assertIncreaseInBalance, advanceBlock, expectRevertCustomError } from "./util/TestUtils";
import { PoolAsk, OptionType, ZERO_ADDRESS } from "./util/TestTypes";
import { TestERC721Instance } from "../types/truffle-contracts/TestERC721.js";
import { WasabiPoolFactoryInstance } from "../types/truffle-contracts/WasabiPoolFactory.js";
import { WasabiOptionInstance } from "../types/truffle-contracts/WasabiOption.js";
import { ETHWasabiPoolInstance, OptionIssued, OptionExecuted } from "../types/truffle-contracts/ETHWasabiPool.js";
import { Transfer } from "../types/truffle-contracts/ERC721";

const Signing = artifacts.require("Signing");
const WasabiPoolFactory = artifacts.require("WasabiPoolFactory");
const WasabiOption = artifacts.require("WasabiOption");
const ETHWasabiPool = artifacts.require("ETHWasabiPool");
const TestERC721 = artifacts.require("TestERC721");

contract("ETHWasabiPool: CallOption (with Admin)", accounts => {
    let poolFactory: WasabiPoolFactoryInstance;
    let option: WasabiOptionInstance;
    let testNft: TestERC721Instance;
    let poolAddress: string;
    let pool: ETHWasabiPoolInstance;
    let optionId: BN;
    let request: PoolAsk;
    let signature;

    const types = [OptionType.CALL];
    const lp = accounts[2];
    const buyer = accounts[3];
    const admin = accounts[4]; // Dkoda
    const someoneElse = accounts[5];
    const duration = 1000;
    const lpPrivateKey = "0dbbe8e4ae425a6d2687f1a7e3ba17bc98c673636790f1b8ad91193c05875ef1";
    const buyerPrivateKey = "c88b703fb08cbea894b6aeff5a544fb92e78a18e19814cd85da83b71f772aa6c";
    const adminPrivateKey = "388c684f0ba1ef5017716adb5d21a053ea8e90277d0868337519f97bede61418";

    before("Prepare State", async function () {
        testNft = await TestERC721.deployed();
        await Signing.deployed();
        option = await WasabiOption.deployed();
        poolFactory = await WasabiPoolFactory.deployed();
        await option.setFactory(poolFactory.address);

        await testNft.mint(metadata(lp));
        await testNft.mint(metadata(lp));
        await testNft.mint(metadata(lp));
        await testNft.mint(metadata(someoneElse));
        await testNft.mint(metadata(buyer));
        await testNft.mint(metadata(buyer));
    });
    
    it("Validate Create Pool Parameters", async () => {
        let config = makeConfig(0, 10, 222, 2630000);
        await truffleAssert.reverts(
            poolFactory.createPool(testNft.address, [1001, 1002, 1003], config, types, ZERO_ADDRESS, metadata(lp)),
            "Min strike price needs to be present",
            "Min strike price needs to be present");

        config = makeConfig(20, 10, 222, 2630000);
        await truffleAssert.reverts(
            poolFactory.createPool(testNft.address, [1001, 1002, 1003], config, types, ZERO_ADDRESS, metadata(lp)),
            "Min strike price cannnot greater than max",
            "Min strike price cannnot greater than max");

        config = makeConfig(1, 10, 0, 222);
        await truffleAssert.reverts(
            poolFactory.createPool(testNft.address, [1001, 1002, 1003], config, types, ZERO_ADDRESS, metadata(lp)),
            "Min duration needs to be present",
            "Min duration needs to be present");

        config = makeConfig(1, 10, 2630000, 222);
        await truffleAssert.reverts(
            poolFactory.createPool(testNft.address, [1001, 1002, 1003], config, types, ZERO_ADDRESS, metadata(lp)),
            "Min duration cannnot greater than max",
            "Min duration cannnot greater than max");
    });
    
    it("Create Pool", async () => {
        await testNft.setApprovalForAll.sendTransaction(poolFactory.address, true, metadata(lp));

        const config = makeConfig(1, 100, 222, 2630000 /* one month */);

        const createPoolResult = await poolFactory.createPool(testNft.address, [1001, 1002, 1003], config, types, ZERO_ADDRESS, metadata(lp));
        truffleAssert.eventEmitted(createPoolResult, "NewPool", null, "Pool wasn't created");
        truffleAssert.eventEmitted(createPoolResult, "OwnershipTransferred", { previousOwner: ZERO_ADDRESS, newOwner: lp }, "Pool didn't change owners correctly");

        poolAddress = createPoolResult.logs.find(e => e.event == "NewPool")!.args[0];
        pool = await ETHWasabiPool.at(poolAddress);
        assert.equal(await pool.owner(), lp, "Pool creator and owner not same");
        assert.deepEqual((await pool.getAllTokenIds()).map(a => a.toNumber()), [1001, 1002, 1003], "Pool doesn't have the correct tokens");
    });
    
    it("Set admin", async () => {
        await truffleAssert.reverts(pool.setAdmin(admin), "caller is not the owner", "Only owner can change the admin.");
        await truffleAssert.reverts(pool.removeAdmin(), "caller is not the owner", "Only owner can change the admin.");
        const setAdminResult = await pool.setAdmin(admin, metadata(lp));
        truffleAssert.eventEmitted(setAdminResult, "AdminChanged", {admin: admin}, "Admin wasn't changed");
    });
    
    it("Validate Option Requests", async () => {

        let id = 1;
        let blockNumber = await web3.eth.getBlockNumber();
        let timestamp = Number((await web3.eth.getBlock(blockNumber)).timestamp);
        let expiry = timestamp + duration;
        let orderExpiry = timestamp - 1000;

        request = makeRequest(id, pool.address, OptionType.CALL, 0, 1, expiry, 1001, orderExpiry); // no strike price in request
        signature = await signPoolAskWithEIP712(request, pool.address, adminPrivateKey)
        await truffleAssert.reverts(
            pool.writeOption(request, await signature, metadata(buyer, 1)),
            "WasabiPool: Order has expired",
            "WasabiPool: Order has expired");

        orderExpiry = timestamp + duration;

        request = makeRequest(id, pool.address, OptionType.CALL, 0, 1, expiry, 1001, orderExpiry); // no strike price in request
        signature = await signPoolAskWithEIP712(request, pool.address, adminPrivateKey)
        await truffleAssert.reverts(
            pool.writeOption(request, signature, metadata(buyer, 1)),
            "Strike price must be set",
            "Strike price must be set");
        
        request = makeRequest(id, pool.address, OptionType.CALL, 10, 0, expiry, 1001, orderExpiry); // no premium in request
        signature = await signPoolAskWithEIP712(request, pool.address, adminPrivateKey)
        await truffleAssert.reverts(
            pool.writeOption.sendTransaction(request, signature, metadata(buyer)),
            "Not enough premium is supplied",
            "Cannot write option when premium is 0");

        request = makeRequest(id, pool.address, OptionType.CALL, 10, 1, expiry, 1001, orderExpiry);
        signature = await signPoolAskWithEIP712(request, pool.address, adminPrivateKey)
        await truffleAssert.reverts(
            pool.writeOption.sendTransaction(request, signature, metadata(buyer, 0.5)), // not sending enough premium
            "Not enough premium is supplied",
            "Premium paid doesn't match the premium of the request");

        id = 2;
        const request2 = makeRequest(id, pool.address, OptionType.CALL, 9, 1, expiry, 1001, orderExpiry);
        signature = await signPoolAskWithEIP712(request2, pool.address, buyerPrivateKey)
        await expectRevertCustomError(
            pool.writeOption.sendTransaction(request, signature, metadata(buyer, 1)),
            "InvalidSignature",
            "Signed object and provided object are different");
    });

    it("Write Option (only owner)", async () => {
        signature = await signPoolAskWithEIP712(request, pool.address, adminPrivateKey)
        const writeOptionResult = await pool.writeOption(request, signature, metadata(buyer, 1));
        truffleAssert.eventEmitted(writeOptionResult, "OptionIssued", null, "Asset wasn't locked");
        assert.equal(await web3.eth.getBalance(pool.address), request.premium, "Incorrect balance in pool");

        const log = writeOptionResult.logs.find(l => l.event == "OptionIssued")! as Truffle.TransactionLog<OptionIssued>;
        optionId = log.args.optionId;
        assert.equal(await option.ownerOf(optionId), buyer, "Buyer not the owner of option");

        request.id = 2;
        signature = await signPoolAskWithEIP712(request, pool.address, adminPrivateKey)
        await expectRevertCustomError(
            pool.writeOption.sendTransaction(request, signature, metadata(buyer, 1)),
            "RequestNftIsLocked",
            "Cannot (re)write an option for a locked asset");
    });

    it("Execute Option (only option holder)", async () => {
        await truffleAssert.reverts(
            pool.executeOption.sendTransaction(optionId, metadata(someoneElse, 10)),
            "Only the token owner can execute the option",
            "Non option holder can't execute the option");
        await truffleAssert.reverts(
            pool.executeOption.sendTransaction(optionId, metadata(buyer, 5)),
            "Strike price needs to be supplied to execute a CALL option",
            "Strike price needs to be supplied to execute a CALL option");
        const executeOptionResult = await pool.executeOption(optionId, metadata(buyer, 10));

        const log = executeOptionResult.logs.find(l => l.event == "OptionExecuted")! as Truffle.TransactionLog<OptionExecuted>;
        const expectedOptionId = log.args.optionId;
        assert.equal(expectedOptionId.toString(), optionId.toString(), "Option wasn't executed");
        assert.equal(await testNft.ownerOf(request.tokenId), buyer, "Option executor didn't get NFT");
        assert.equal(await web3.eth.getBalance(pool.address), toEth(10 + 1), "Incorrect balance in pool");
        await truffleAssert.reverts(option.ownerOf(optionId), "ERC721: invalid token ID", "Option NFT not burned after execution");
    });
    
    it("Issue Option & Send/Sell Back to Pool", async () => {
        let initialPoolBalance = toBN(await web3.eth.getBalance(pool.address));
        assert.deepEqual((await pool.getAllTokenIds()).map(a => a.toNumber()), [1003, 1002], "Pool doesn't have the correct tokens");

        const id = 3;
        let blockNumber = await web3.eth.getBlockNumber();
        let timestamp = Number((await web3.eth.getBlock(blockNumber)).timestamp);
        let expiry = timestamp + duration;
        let orderExpiry = timestamp + duration;
        request = makeRequest(id, pool.address, OptionType.CALL, 10, 1, expiry, 1002, orderExpiry);
        signature = await signPoolAskWithEIP712(request, pool.address, adminPrivateKey)
        const writeOptionResult = await pool.writeOption(request, signature, metadata(buyer, 1));
        truffleAssert.eventEmitted(writeOptionResult, "OptionIssued", null, "Asset wasn't locked");
        assert.equal(
            await web3.eth.getBalance(pool.address),
            initialPoolBalance.add(toBN(request.premium)).toString(),
            "Incorrect balance in pool");

        const log = writeOptionResult.logs.find(l => l.event == "OptionIssued")! as Truffle.TransactionLog<OptionIssued>;
        const optionId = log.args.optionId;
        assert.equal(await option.ownerOf(optionId), buyer, "Buyer not the owner of option");

        const result = await option.methods["safeTransferFrom(address,address,uint256)"](buyer, pool.address, optionId, metadata(buyer));
        const transferLog = (result.logs.filter(l => l.event === 'Transfer'))[1] as Truffle.TransactionLog<Transfer>;
        assert.equal(transferLog.args.to, ZERO_ADDRESS, "Token wasn't burned");
        assert.equal(transferLog.args.tokenId.toString(), optionId.toString(), "Incorrect option was burned");

        await truffleAssert.reverts(option.ownerOf(optionId), "ERC721: invalid token ID", "Option NFT not burned after execution");
    });

    it("Withdraw ERC721", async () => {
        await expectRevertCustomError(
            pool.withdrawERC721.sendTransaction(testNft.address, [1001], metadata(lp)),
            "NftIsInvalid",
            "Token is locked or is not in the pool");
        await truffleAssert.reverts(
            pool.withdrawERC721.sendTransaction(testNft.address, [1002], metadata(admin)),
            "caller is not the owner",
            "Admin cannot withdraw ERC721");
        await pool.withdrawERC721.sendTransaction(testNft.address, [1002, 1003], metadata(lp))
        assert.equal(await testNft.ownerOf(1002), lp, "Pool owner didn't receive withdrawn NFT");
        assert.equal(await testNft.ownerOf(1003), lp, "Pool owner didn't receive withdrawn NFT");
    });

    it("Withdraw ETH", async () => {
        const availablePoolBalance = await pool.availableBalance();
        await truffleAssert.reverts(
            pool.withdrawETH.sendTransaction(availablePoolBalance, metadata(admin)),
            "caller is not the owner",
            "Admin cannot withdraw ETH");
        const initialBalance = toBN(await web3.eth.getBalance(lp));
        const withdrawETHResult = await pool.withdrawETH(availablePoolBalance, metadata(lp));
        await assertIncreaseInBalance(lp, initialBalance, availablePoolBalance.sub(gasOfTxn(withdrawETHResult.receipt)));
        assert.equal(await web3.eth.getBalance(pool.address), '0', "Incorrect balance in pool");
    });

    it("Validate Update Pool Parameters", async () => {
        let config = makeConfig(1, 10, 222, 2630000);
        await truffleAssert.reverts(
            pool.setPoolConfiguration(config, metadata(someoneElse)),
            "caller is not the owner",
            "caller is not the owner");

        config = makeConfig(0, 10, 222, 2630000);
        await truffleAssert.reverts(
            pool.setPoolConfiguration(config, metadata(lp)),
            "Min strike price needs to be present",
            "Min strike price needs to be present");

        config = makeConfig(20, 10, 222, 2630000);
        await truffleAssert.reverts(
            pool.setPoolConfiguration(config, metadata(lp)),
            "Min strike price cannnot greater than max",
            "Min strike price cannnot greater than max");

        config = makeConfig(1, 10, 0, 222);
        await truffleAssert.reverts(
            pool.setPoolConfiguration(config, metadata(lp)),
            "Min duration needs to be present",
            "Min duration needs to be present");

        config = makeConfig(1, 10, 2630000, 222);
        await truffleAssert.reverts(
            pool.setPoolConfiguration(config, metadata(lp)),
            "Min duration cannnot greater than max",
            "Min duration cannnot greater than max");
    });
});
