const truffleAssert = require('truffle-assertions');

import { toEth, toBN, makeRequest, makeConfig, metadata, signRequest, gasOfTxn, assertIncreaseInBalance, advanceTime } from "./util/TestUtils";
import { OptionRequest, OptionType, ZERO_ADDRESS } from "./util/TestTypes";
import { TestERC721Instance } from "../types/truffle-contracts/TestERC721.js";
import { WasabiPoolFactoryInstance } from "../types/truffle-contracts/WasabiPoolFactory.js";
import { WasabiOptionInstance } from "../types/truffle-contracts/WasabiOption.js";
import { ERC20WasabiPoolInstance, OptionIssued, OptionExecuted } from "../types/truffle-contracts/ERC20WasabiPool.js";
import { DemoETHInstance } from "../types/truffle-contracts";
import { Transfer } from "../types/truffle-contracts/ERC721";
import { WasabiConduitInstance } from "../types/truffle-contracts/WasabiConduit";

const Signing = artifacts.require("Signing");
const WasabiPoolFactory = artifacts.require("WasabiPoolFactory");
const WasabiOption = artifacts.require("WasabiOption");
const ERC20WasabiPool = artifacts.require("ERC20WasabiPool");
const TestERC721 = artifacts.require("TestERC721");
const DemoETH = artifacts.require("DemoETH");
const WasabiConduit = artifacts.require("WasabiConduit");

contract("WasabiConduit ERC20", accounts => {
    let token: DemoETHInstance;
    let poolFactory: WasabiPoolFactoryInstance;
    let option: WasabiOptionInstance;
    let testNft: TestERC721Instance;
    let poolAddress: string;
    let pool: ERC20WasabiPoolInstance;
    let optionId: BN;
    let request: OptionRequest;
    let conduit: WasabiConduitInstance;

    const lp = accounts[2];
    const buyer = accounts[3];
    const someoneElse = accounts[5];

    before("Prepare State", async function () {
        conduit = await WasabiConduit.deployed();
        token = await DemoETH.deployed();
        testNft = await TestERC721.deployed();
        await Signing.deployed();
        option = await WasabiOption.deployed();
        poolFactory = await WasabiPoolFactory.deployed();
        await option.setFactory(poolFactory.address);
        await conduit.setOption(option.address);
        
        await token.mint(metadata(buyer));

        await testNft.mint(metadata(lp));
        await testNft.mint(metadata(lp));
        await testNft.mint(metadata(lp));
        await testNft.mint(metadata(someoneElse));
        await testNft.mint(metadata(buyer));
        await testNft.mint(metadata(buyer));
    });
    
    it("Create Pool", async () => {
        assert.equal((await token.balanceOf(buyer)).toString(), toEth(100), 'Not enough minted');

        await testNft.setApprovalForAll.sendTransaction(poolFactory.address, true, metadata(lp));

        const config = makeConfig(1, 100, 222, 2630000 /* one month */);
        const types = [OptionType.CALL];
        const createPoolResult =
            await poolFactory.createERC20Pool(
                token.address,
                0,
                testNft.address,
                [1001, 1002, 1003],
                config,
                types,
                ZERO_ADDRESS,
                metadata(lp));
        truffleAssert.eventEmitted(createPoolResult, "NewPool", null, "Pool wasn't created");
        truffleAssert.eventEmitted(createPoolResult, "OwnershipTransferred", { previousOwner: ZERO_ADDRESS, newOwner: lp }, "Pool didn't change owners correctly");

        poolAddress = createPoolResult.logs.find(e => e.event == "NewPool")!.args[0];
        pool = await ERC20WasabiPool.at(poolAddress);
        assert.equal(await pool.owner(), lp, "Pool creator and owner not same");
        assert.deepEqual((await pool.getAllTokenIds()).map(a => a.toNumber()), [1001, 1002, 1003], "Pool doesn't have the correct tokens");

        assert.equal(await pool.getLiquidityAddress(), token.address, 'Token not correct');
    });

    it("Write Option (only owner)", async () => {
        let blockNumber = await web3.eth.getBlockNumber();
        let maxBlockToExecute = blockNumber + 5;
        const premium = 1;
        request = makeRequest(pool.address, OptionType.CALL, 10, premium, 263000, 1001, maxBlockToExecute);

        await token.approve(conduit.address, toEth(premium * 10), metadata(buyer));

        optionId = await conduit.buyOption.call(request, await signRequest(request, lp), metadata(buyer));
        await conduit.buyOption(request, await signRequest(request, lp), metadata(buyer));
        assert.equal(await token.balanceOf(pool.address), request.premium, "Incorrect balance in pool");

        assert.equal(await option.ownerOf(optionId), buyer, "Buyer not the owner of option");
        const expectedOptionId = await pool.getOptionIdForToken(request.tokenId);
        assert.equal(expectedOptionId.toNumber(), optionId.toNumber(), "Option of token not correct");

        await truffleAssert.reverts(
            conduit.buyOption(request, await signRequest(request, lp), metadata(buyer)),
            "Token is locked",
            "Cannot (re)write an option for a locked asset");
    });

    it("Execute Option (only option holder)", async () => {
        await truffleAssert.reverts(
            pool.executeOption.sendTransaction(optionId, metadata(someoneElse)),
            "Only the token owner can execute the option",
            "Non option holder can't execute the option");
        await truffleAssert.reverts(
            pool.executeOption.sendTransaction(optionId, metadata(buyer, 5)),
            "Strike price needs to be supplied to execute a CALL option",
            "Strike price needs to be supplied to execute a CALL option");

        await token.approve(pool.address, request.strikePrice, metadata(buyer));
        const executeOptionResult = await pool.executeOption(optionId, metadata(buyer));

        const log = executeOptionResult.logs.find(l => l.event == "OptionExecuted")! as Truffle.TransactionLog<OptionExecuted>;
        const expectedOptionId = log.args.optionId;

        assert.equal(expectedOptionId.toString(), optionId.toString(), "Option wasn't executed");
        assert.equal(await testNft.ownerOf(request.tokenId), buyer, "Option executor didn't get NFT");
        assert.equal((await token.balanceOf(pool.address)).toString(), toEth(10 + 1), "Incorrect balance in pool");
        await truffleAssert.reverts(option.ownerOf(optionId), "ERC721: invalid token ID", "Option NFT not burned after execution");
    });
    
    it("Issue Option & Send/Sell Back to Pool", async () => {
        let initialPoolBalance = await token.balanceOf(poolAddress);
        assert.deepEqual((await pool.getAllTokenIds()).map(a => a.toNumber()), [1003, 1002], "Pool doesn't have the correct tokens");

        let blockNumber = await web3.eth.getBlockNumber();
        request = makeRequest(pool.address, OptionType.CALL, 10, 1, 263000, 1002, blockNumber + 5);
        await token.approve(pool.address, request.premium, metadata(buyer));
        const writeOptionResult = await pool.writeOption(request, await signRequest(request, lp), metadata(buyer));
        truffleAssert.eventEmitted(writeOptionResult, "OptionIssued", null, "Asset wasn't locked");
        assert.equal(
            (await token.balanceOf(poolAddress)).toString(),
            initialPoolBalance.add(toBN(request.premium)).toString(),
            "Incorrect balance in pool");

        const issueLog = writeOptionResult.logs.find(l => l.event == "OptionIssued")! as Truffle.TransactionLog<OptionIssued>;
        const optionId = issueLog.args.optionId;
        assert.equal(await option.ownerOf(optionId), buyer, "Buyer not the owner of option");

        const result = await option.methods["safeTransferFrom(address,address,uint256)"](buyer, pool.address, optionId, metadata(buyer));
        const transferLog = (result.logs.filter(l => l.event === 'Transfer'))[1] as Truffle.TransactionLog<Transfer>;
        assert.equal(transferLog.args.to, ZERO_ADDRESS, "Token wasn't burned");
        assert.equal(transferLog.args.tokenId.toString(), optionId.toString(), "Incorrect option was burned");

        await truffleAssert.reverts(pool.getOptionData(optionId), "Option doesn't belong to this pool", "Option data not cleared correctly");
        await truffleAssert.reverts(option.ownerOf(optionId), "ERC721: invalid token ID", "Option NFT not burned after execution");
    });

    it("Withdraw ERC721", async () => {
        await truffleAssert.reverts(
            pool.withdrawERC721.sendTransaction(testNft.address, [1001], metadata(lp)),
            "Token is not in the pool",
            "Token is locked or is not in the pool");
        await truffleAssert.reverts(
            pool.withdrawERC721.sendTransaction(testNft.address, [1002], {from: buyer}),
            "caller is not the owner",
            "Only pool owner can withdraw assets");
        await pool.withdrawERC721.sendTransaction(testNft.address, [1002, 1003], metadata(lp))
        assert.equal(await testNft.ownerOf(1002), lp, "Pool owner didn't receive withdrawn NFT");
        assert.equal(await testNft.ownerOf(1003), lp, "Pool owner didn't receive withdrawn NFT");
    });

    it("Withdraw ETH", async () => {
        const value = toBN(toEth(5));
        await web3.eth.sendTransaction({from: lp, to: poolAddress, value: value});
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
});