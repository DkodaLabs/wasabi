const truffleAssert = require('truffle-assertions');

import { toEth, toBN, makeRequest, makeConfig, metadata, signRequest, gasOfTxn, assertIncreaseInBalance, advanceTime, expectRevertCustomError } from "./util/TestUtils";
import { OptionRequest, OptionType, ZERO_ADDRESS } from "./util/TestTypes";
import { TestERC721Instance } from "../types/truffle-contracts/TestERC721.js";
import { WasabiPoolFactoryInstance } from "../types/truffle-contracts/WasabiPoolFactory.js";
import { WasabiOptionInstance } from "../types/truffle-contracts/WasabiOption.js";
import { ERC20WasabiPoolInstance, OptionIssued, OptionExecuted } from "../types/truffle-contracts/ERC20WasabiPool.js";
import { DemoETHInstance } from "../types/truffle-contracts";
import { WasabiConduitInstance } from "../types/truffle-contracts/WasabiConduit";
import { request } from "http";

const Signing = artifacts.require("Signing");
const WasabiPoolFactory = artifacts.require("WasabiPoolFactory");
const WasabiOption = artifacts.require("WasabiOption");
const ERC20WasabiPool = artifacts.require("ERC20WasabiPool");
const TestERC721 = artifacts.require("TestERC721");
const DemoETH = artifacts.require("DemoETH");
const WasabiConduit = artifacts.require("WasabiConduit");

contract("WasabiConduit Multibuy ERC20", accounts => {
    let token: DemoETHInstance;
    let poolFactory: WasabiPoolFactoryInstance;
    let option: WasabiOptionInstance;
    let testNft: TestERC721Instance;
    let poolAddress: string;
    let pool: ERC20WasabiPoolInstance;
    let optionIds: BN[];
    let requests: OptionRequest[];
    let conduit: WasabiConduitInstance;

    const lp = accounts[2];
    const buyer = accounts[3];
    const someoneElse = accounts[5];
    const strike = 10;
    const premium = 1;

    before("Prepare State", async function () {
        conduit = await WasabiConduit.deployed();
        token = await DemoETH.deployed();
        testNft = await TestERC721.deployed();
        await Signing.deployed();
        option = await WasabiOption.deployed();
        poolFactory = await WasabiPoolFactory.deployed();
        await option.setFactory(poolFactory.address);
        await conduit.setOption(option.address);
        await conduit.setMaxOptionsToBuy(2);
        
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
        const id = 1;
        let blockNumber = await web3.eth.getBlockNumber();
        let timestamp = Number((await web3.eth.getBlock(blockNumber)).timestamp);
        let expiry = timestamp + 10000;
        let orderExpiry = timestamp + 10000;
        requests = [
            makeRequest(id, pool.address, OptionType.CALL, strike, premium, expiry, 1001, orderExpiry),
            makeRequest(id + 1, pool.address, OptionType.CALL, strike, premium, expiry, 1002, orderExpiry)
        ];

        await token.approve(conduit.address, toEth(premium * requests.length), metadata(buyer));

        const signatures = [] as string[];
        for (let i = 0; i < requests.length; i++) {
            signatures.push(await signRequest(requests[i], lp));   
        }

        optionIds = await conduit.buyOptions.call(requests, [], signatures, metadata(buyer));
        await conduit.buyOptions(requests, [], signatures, metadata(buyer));

        assert.equal(
            (await token.balanceOf(pool.address)).toString(),
            toEth(premium * 2).toString(),
            "Incorrect balance in pool");

        await token.approve(conduit.address, toEth(premium * requests.length), metadata(buyer));
        for (let i = 0; i < optionIds.length; i++) {
            const optionId = optionIds[i];
            assert.equal(await option.ownerOf(optionId), buyer, "Buyer not the owner of option");
            const expectedOptionId = await pool.getOptionIdForToken(requests[i].tokenId);
            assert.equal(expectedOptionId.toNumber(), optionId.toNumber(), "Option of token not correct");

            requests[i].id = requests[i].id + 2;
            await expectRevertCustomError(
                conduit.buyOption(requests[i], await signRequest(requests[i], lp), metadata(buyer)),
                "RequestNftIsLocked",
                "Cannot (re)write an option for a locked asset");
        }
    });

    it("Execute Option (only option holder)", async () => {
        for (let i = 0; i < optionIds.length; i++) {
            const optionId = optionIds[i];

            await truffleAssert.reverts(
                pool.executeOption.sendTransaction(optionId, metadata(someoneElse)),
                "Only the token owner can execute the option",
                "Non option holder can't execute the option");
            await truffleAssert.reverts(
                pool.executeOption.sendTransaction(optionId, metadata(buyer, 5)),
                "Strike price needs to be supplied to execute a CALL option",
                "Strike price needs to be supplied to execute a CALL option");
    
            await token.approve(pool.address, requests[i].strikePrice, metadata(buyer));
            const executeOptionResult = await pool.executeOption(optionId, metadata(buyer));
    
            const log = executeOptionResult.logs.find(l => l.event == "OptionExecuted")! as Truffle.TransactionLog<OptionExecuted>;
            const expectedOptionId = log.args.optionId;
    
            assert.equal(expectedOptionId.toString(), optionId.toString(), "Option wasn't executed");
            assert.equal(await testNft.ownerOf(requests[i].tokenId), buyer, "Option executor didn't get NFT");
            await truffleAssert.reverts(option.ownerOf(optionId), "ERC721: invalid token ID", "Option NFT not burned after execution");
        }
        assert.equal((await token.balanceOf(pool.address)).toString(), toEth(requests.length * (strike + premium)), "Incorrect balance in pool");
    });

    it("Withdraw ERC721", async () => {
        await expectRevertCustomError(
            pool.withdrawERC721.sendTransaction(testNft.address, [1001], metadata(lp)),
            "NftIsInvalid",
            "Token is locked or is not in the pool");
        await truffleAssert.reverts(
            pool.withdrawERC721.sendTransaction(testNft.address, [1003], {from: buyer}),
            "caller is not the owner",
            "Only pool owner can withdraw assets");
        await pool.withdrawERC721.sendTransaction(testNft.address, [1003], metadata(lp))
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
