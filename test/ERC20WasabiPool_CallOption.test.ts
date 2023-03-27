const truffleAssert = require('truffle-assertions');

import { toEth, toBN, makeRequest, makeConfig, metadata, gasOfTxn, assertIncreaseInBalance, advanceTime, expectRevertCustomError, withBid, signPoolAskWithEIP712 } from "./util/TestUtils";
import { PoolAsk, OptionType, ZERO_ADDRESS } from "./util/TestTypes";
import { TestERC721Instance } from "../types/truffle-contracts/TestERC721.js";
import { WasabiPoolFactoryInstance } from "../types/truffle-contracts/WasabiPoolFactory.js";
import { WasabiOptionInstance } from "../types/truffle-contracts/WasabiOption.js";
import { ERC20WasabiPoolInstance, OptionIssued, OptionExecuted } from "../types/truffle-contracts/ERC20WasabiPool.js";
import { DemoETHInstance } from "../types/truffle-contracts";
import { Transfer } from "../types/truffle-contracts/ERC721";

const Signing = artifacts.require("Signing");
const WasabiPoolFactory = artifacts.require("WasabiPoolFactory");
const WasabiOption = artifacts.require("WasabiOption");
const ERC20WasabiPool = artifacts.require("ERC20WasabiPool");
const TestERC721 = artifacts.require("TestERC721");
const DemoETH = artifacts.require("DemoETH");

contract("ERC20WasabiPool: CallOption", accounts => {
    let token: DemoETHInstance;
    let poolFactory: WasabiPoolFactoryInstance;
    let option: WasabiOptionInstance;
    let testNft: TestERC721Instance;
    let poolAddress: string;
    let pool: ERC20WasabiPoolInstance;
    let optionId: BN;
    let request: PoolAsk;

    const lp = accounts[2];
    const buyer = accounts[3];
    const someoneElse = accounts[5];
    const duration = 10000;

    const lpPrivateKey = "0dbbe8e4ae425a6d2687f1a7e3ba17bc98c673636790f1b8ad91193c05875ef1";
    const someoneElsePrivateKey = "659cbb0e2411a44db63778987b1e22153c086a95eb6b18bdf89de078917abc63";

    var signature;

    before("Prepare State", async function () {
        token = await DemoETH.deployed();
        testNft = await TestERC721.deployed();
        await Signing.deployed();
        option = await WasabiOption.deployed();
        poolFactory = await WasabiPoolFactory.deployed();
        await option.setFactory(poolFactory.address);
        
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
    
    it("Validate Option Requests", async () => {
        let id = 1;
        let blockNumber = await web3.eth.getBlockNumber();
        let timestamp = Number((await web3.eth.getBlock(blockNumber)).timestamp);
        let expiry = timestamp + duration;
        let orderExpiry = timestamp + duration;

        const premium = 1;
        const allowed = premium * 2;

        request = makeRequest(id, pool.address, OptionType.CALL, 10, premium, expiry, 1001, orderExpiry); // no premium in request
        signature = await signPoolAskWithEIP712(request, pool.address, lpPrivateKey);
        await truffleAssert.reverts(
            pool.writeOption.sendTransaction(request, signature, metadata(buyer)),
            "Not enough premium is supplied",
            "No permission given to transfer enough tokens");

        await token.approve(pool.address, toEth(allowed), metadata(buyer));

        orderExpiry = timestamp - 1000;
        request = makeRequest(id, pool.address, OptionType.CALL, 10, premium, expiry, 1001, orderExpiry); // no premium in request
        signature = await signPoolAskWithEIP712(request, pool.address, lpPrivateKey);
        await truffleAssert.reverts(
            pool.writeOption(request,signature , metadata(buyer, 1)),
            "WasabiPool: Order has expired",
            "WasabiPool: Order has expired");

        orderExpiry = timestamp + duration;

        request = makeRequest(id, pool.address, OptionType.CALL, 0, premium, expiry, 1001, orderExpiry); // no premium in request
        signature = await signPoolAskWithEIP712(request, pool.address, lpPrivateKey);
        await truffleAssert.reverts(
            pool.writeOption(request,signature , metadata(buyer)),
            "Strike price must be set",
            "Strike price must be set");
        
        request = makeRequest(id, pool.address, OptionType.CALL, 10, 0, expiry, 1001, orderExpiry); // no premium in request
        
        signature = await signPoolAskWithEIP712(request, pool.address, lpPrivateKey);
        await truffleAssert.reverts(
            pool.writeOption.sendTransaction(request, signature, metadata(lp)),
            "Not enough premium is supplied",
            "Cannot write option when premium is 0");

        request = makeRequest(id, pool.address, OptionType.CALL, 10, allowed + 0.1, expiry, 1001, orderExpiry);
        signature = await signPoolAskWithEIP712(request, pool.address, lpPrivateKey);
        await truffleAssert.reverts(
            pool.writeOption.sendTransaction(request, signature, metadata(buyer)), // not sending enough premium
            "Not enough premium is supplied",
            "Premium paid doesn't match the premium of the request");

        id = 2;
        const request2 = makeRequest(id, pool.address, OptionType.CALL, 9, premium, expiry, 1001, orderExpiry);
        signature = await signPoolAskWithEIP712(request2, pool.address, someoneElsePrivateKey);
        await expectRevertCustomError(
            pool.writeOption.sendTransaction(request2, signature, metadata(buyer)),
            'InvalidSignature'
        );

        const emptySignature = "0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";
        await expectRevertCustomError(
            pool.writeOption.sendTransaction(request, emptySignature, metadata(buyer)),
            'InvalidSignature'
        );
        signature = await signPoolAskWithEIP712(request, pool.address, someoneElsePrivateKey)
        await expectRevertCustomError(
            pool.writeOption.sendTransaction(request, signature, metadata(buyer)),
            'InvalidSignature',
            'Must be signed by owner'
        );
        id = 3;
        request = makeRequest(id, pool.address, OptionType.CALL, 10, premium, expiry, 1001, orderExpiry);
    });

    it("Write Option (only owner)", async () => {

        signature = await signPoolAskWithEIP712(request, pool.address, lpPrivateKey);
        const writeOptionResult = await pool.writeOption(request, signature, metadata(buyer));
        truffleAssert.eventEmitted(writeOptionResult, "OptionIssued", null, "Asset wasn't locked");
        assert.equal(await token.balanceOf(pool.address), request.premium, "Incorrect balance in pool");

        const log = writeOptionResult.logs.find(l => l.event == "OptionIssued")! as Truffle.TransactionLog<OptionIssued>;
        optionId = log.args.optionId;

        assert.equal(await option.ownerOf(optionId), buyer, "Buyer not the owner of option");
        const expectedOptionId = await pool.getOptionIdForToken(request.tokenId);
        assert.equal(expectedOptionId.toNumber(), optionId.toNumber(), "Option of token not correct");

        request.id = 4;
        signature = await signPoolAskWithEIP712(request, pool.address, lpPrivateKey);
        await expectRevertCustomError(
            pool.writeOption.sendTransaction(request, signature, metadata(buyer)),
            "RequestNftIsLocked",
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

        const id = 4;
        let blockNumber = await web3.eth.getBlockNumber();
        let timestamp = Number((await web3.eth.getBlock(blockNumber)).timestamp);
        let expiry = timestamp + duration;
        let orderExpiry = timestamp + duration;

        request = makeRequest(id, pool.address, OptionType.CALL, 10, 1, expiry, 1002, orderExpiry);
        await token.approve(pool.address, request.premium, metadata(buyer));
        signature = await signPoolAskWithEIP712(request, pool.address, lpPrivateKey);
        const writeOptionResult = await pool.writeOption(request, signature, metadata(buyer));
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
        await truffleAssert.reverts(option.ownerOf(optionId), "ERC721: invalid token ID", "Option NFT not burned after execution");
    });

    it("Cancel Request", async () => {
        assert.deepEqual((await pool.getAllTokenIds()).map(a => a.toNumber()), [1003, 1002], "Pool doesn't have the correct tokens");

        const id = 5;
        let blockNumber = await web3.eth.getBlockNumber();
        let timestamp = Number((await web3.eth.getBlock(blockNumber)).timestamp);
        let expiry = timestamp + duration;
        let orderExpiry = timestamp + duration;

        request = makeRequest(id, pool.address, OptionType.CALL, 10, 1, expiry, 1002, orderExpiry);
        await token.approve(pool.address, request.premium, metadata(buyer));
        await truffleAssert.reverts(
            pool.cancelRequest(request.id, metadata(buyer)),
            "WasabiPool: only admin or owner cancel",
            "OWasabiPool: only admin or owner cancel");
        const cancelRequestResult = await pool.cancelRequest(request.id, metadata(lp));
        truffleAssert.eventEmitted(cancelRequestResult, "RequestCancelled", null, "Asset wasn't locked");

        signature = await signPoolAskWithEIP712(request, pool.address, lpPrivateKey);
        await expectRevertCustomError(
            pool.writeOption(request, signature, metadata(buyer)),
            'OrderFilledOrCancelled'
        );
    });

    it("Withdraw ERC721", async () => {
        await expectRevertCustomError(
            pool.withdrawERC721.sendTransaction(testNft.address, [1001], metadata(lp)),
            "NftIsInvalid",
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
