const truffleAssert = require('truffle-assertions');

import { toEth, toBN, makeRequest, makeConfig, metadata, signPoolAskWithEIP712, fromWei, signBidWithEIP712, signAskWithEIP712, expectRevertCustomError } from "./util/TestUtils";
import { Ask, Bid, OptionData, PoolAsk, OptionType, ZERO_ADDRESS } from "./util/TestTypes";
import { TestERC721Instance } from "../types/truffle-contracts/TestERC721.js";
import { TestAzukiInstance } from "../types/truffle-contracts/TestAzuki.js";
import { WasabiPoolFactoryInstance } from "../types/truffle-contracts/WasabiPoolFactory.js";
import { WasabiOptionInstance } from "../types/truffle-contracts/WasabiOption.js";
import { ERC20WasabiPoolInstance, OptionIssued, OptionExecuted } from "../types/truffle-contracts/ERC20WasabiPool.js";
import { DemoETHInstance } from "../types/truffle-contracts";
import { WasabiConduitInstance } from "../types/truffle-contracts/WasabiConduit";
import { WasabiFeeManagerInstance } from "../types/truffle-contracts/WasabiFeeManager";

const Signing = artifacts.require("Signing");
const WasabiPoolFactory = artifacts.require("WasabiPoolFactory");
const WasabiOption = artifacts.require("WasabiOption");
const ERC20WasabiPool = artifacts.require("ERC20WasabiPool");
const TestERC721 = artifacts.require("TestERC721");
const DemoETH = artifacts.require("DemoETH");
const WasabiConduit = artifacts.require("WasabiConduit");
const WasabiFeeManager = artifacts.require("WasabiFeeManager");
const TestAzuki = artifacts.require("TestAzuki");

contract("WasabiConduit ERC20", accounts => {
    let token: DemoETHInstance;
    let poolFactory: WasabiPoolFactoryInstance;
    let option: WasabiOptionInstance;
    let testNft: TestERC721Instance;
    let poolAddress: string;
    let pool: ERC20WasabiPoolInstance;
    let optionId: BN;
    let request: PoolAsk;
    let conduit: WasabiConduitInstance;
    let feeManager: WasabiFeeManagerInstance;
    let royaltyPayoutPercent = 20;
    let testAzukiInstance: TestAzukiInstance;

    const lp = accounts[2];
    const buyer = accounts[3];
    const someoneElse = accounts[5];
    const buyerPrivateKey = "c88b703fb08cbea894b6aeff5a544fb92e78a18e19814cd85da83b71f772aa6c";
    const someoneElsePrivateKey = "659cbb0e2411a44db63778987b1e22153c086a95eb6b18bdf89de078917abc63";
    const lpPrivateKey = "0dbbe8e4ae425a6d2687f1a7e3ba17bc98c673636790f1b8ad91193c05875ef1";

    let signature;

    before("Prepare State", async function () {
        conduit = await WasabiConduit.deployed();
        token = await DemoETH.deployed();
        testNft = await TestERC721.deployed();
        await Signing.deployed();
        option = await WasabiOption.deployed();
        poolFactory = await WasabiPoolFactory.deployed();
        feeManager = await WasabiFeeManager.deployed();
        testAzukiInstance = await TestAzuki.deployed();

        // Set Fee
        await feeManager.setFraction(royaltyPayoutPercent);

        await option.setFactory(poolFactory.address);
        await conduit.setOption(option.address);
        await conduit.setPoolFactoryAddress(poolFactory.address);
        
        await token.mint(metadata(buyer));
        await token.mint(metadata(someoneElse));

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
        const premium = 1;
        request = makeRequest(id, pool.address, OptionType.CALL, 10, premium, expiry, 1001, orderExpiry);

        await token.approve(conduit.address, toEth(premium * 10), metadata(buyer));

        signature = await signPoolAskWithEIP712(request, pool.address, lpPrivateKey);
        optionId = await conduit.buyOption.call(request, signature, metadata(buyer));

        signature = await signPoolAskWithEIP712(request, pool.address, lpPrivateKey);
        await conduit.buyOption(request, signature, metadata(buyer));
        assert.equal(await token.balanceOf(pool.address), request.premium, "Incorrect balance in pool");

        assert.equal(await option.ownerOf(optionId), buyer, "Buyer not the owner of option");
        const expectedOptionId = await pool.getOptionIdForToken(request.tokenId);
        assert.equal(expectedOptionId.toNumber(), optionId.toNumber(), "Option of token not correct");

        request.id = request.id + 1;
        signature = await signPoolAskWithEIP712(request, pool.address, lpPrivateKey);
        await expectRevertCustomError(
            conduit.buyOption(request, signature, metadata(buyer)),
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

        let strikePrice = fromWei(request.strikePrice.toString());
        await token.approve(pool.address, toEth(strikePrice * (1000 + royaltyPayoutPercent) / 1000), metadata(buyer));
        const executeOptionResult = await pool.executeOption(optionId, metadata(buyer));

        const log = executeOptionResult.logs.find(l => l.event == "OptionExecuted")! as Truffle.TransactionLog<OptionExecuted>;
        const expectedOptionId = log.args.optionId;

        assert.equal(expectedOptionId.toString(), optionId.toString(), "Option wasn't executed");
        assert.equal(await testNft.ownerOf(request.tokenId), buyer, "Option executor didn't get NFT");
        assert.equal((await token.balanceOf(pool.address)).toString(), toEth(10 + 1), "Incorrect balance in pool");
        await truffleAssert.reverts(option.ownerOf(optionId), "ERC721: invalid token ID", "Option NFT not burned after execution");
    });
    
    it("Issue Option", async () => {
        let initialPoolBalance = await token.balanceOf(poolAddress);
        assert.deepEqual((await pool.getAllTokenIds()).map(a => a.toNumber()), [1003, 1002], "Pool doesn't have the correct tokens");

        request.id = request.id + 1;
        let blockNumber = await web3.eth.getBlockNumber();
        let timestamp = Number((await web3.eth.getBlock(blockNumber)).timestamp);
        let expiry = timestamp + 10000;
        let orderExpiry = timestamp + 10000;
        request = makeRequest(request.id, pool.address, OptionType.CALL, 10, 1, expiry, 1002, orderExpiry);

        let premium = fromWei(request.premium.toString());
        await token.approve(pool.address, toEth(premium * (1000 + royaltyPayoutPercent) / 1000), metadata(buyer));

        const signature = await signPoolAskWithEIP712(request, pool.address, lpPrivateKey);
        const writeOptionResult = await pool.writeOption(request, signature, metadata(buyer));
        truffleAssert.eventEmitted(writeOptionResult, "OptionIssued", null, "Asset wasn't locked");
        assert.equal(
            (await token.balanceOf(poolAddress)).toString(),
            initialPoolBalance.add(toBN(request.premium)).toString(),
            "Incorrect balance in pool");

        const issueLog = writeOptionResult.logs.find(l => l.event == "OptionIssued")! as Truffle.TransactionLog<OptionIssued>;
        optionId = issueLog.args.optionId;
        assert.equal(await option.ownerOf(optionId), buyer, "Buyer not the owner of option");
    });


    it("Accept ask", async () => {
        const price = 1;
        let optionOwner = await option.ownerOf(optionId);

        await option.setApprovalForAll(conduit.address, true, metadata(optionOwner));

        let blockTimestamp = await (await web3.eth.getBlock(await web3.eth.getBlockNumber())).timestamp;
        const ask: Ask = {
            id: 1,
            optionId: optionId.toString(),
            orderExpiry: Number(blockTimestamp) + 20,
            price: toEth(price),
            seller: optionOwner,
            tokenAddress: token.address,
        };

        const signature = await signAskWithEIP712(ask, conduit.address, buyerPrivateKey);
        await token.approve(conduit.address, ask.price, metadata(someoneElse));

        // Fee Manager
        const royaltyReceiver = await feeManager.owner()
        const initialRoyaltyReceiverBalance = await token.balanceOf(royaltyReceiver);

        const initialBalanceBuyer = await token.balanceOf(someoneElse);
        const initialBalanceSeller = await token.balanceOf(optionOwner);
        const acceptAskResult = await conduit.acceptAsk(ask, signature, metadata(someoneElse));
        const finalBalanceBuyer = await token.balanceOf(someoneElse);
        const finalBalanceSeller = await token.balanceOf(optionOwner);
        const finalRoyaltyReceiverBalance = await token.balanceOf(royaltyReceiver);
        
        truffleAssert.eventEmitted(acceptAskResult, "AskTaken", null, "Ask wasn't taken");
        assert.equal(await option.ownerOf(optionId), someoneElse, "Option not owned after buying");
        assert.equal(fromWei(initialBalanceBuyer.sub(finalBalanceBuyer)), price, 'Buyer incorrect balance change')

        const royaltyAmount = price * royaltyPayoutPercent / 1000;
        const sellerAmount = price - royaltyAmount;
        assert.equal(fromWei(finalBalanceSeller.sub(initialBalanceSeller)), sellerAmount, 'Seller incorrect balance change')

        // Fee Manager
        assert.equal(fromWei(finalRoyaltyReceiverBalance.sub(initialRoyaltyReceiverBalance)), royaltyAmount, 'Fee receiver incorrect balance change')

    });

    it("Accept bid: Invalid liquidity address", async () => {
        const price = 1;
        let optionOwner = await option.ownerOf(optionId);

        await option.setApprovalForAll(conduit.address, true, metadata(optionOwner));

        const optionData: OptionData = await pool.getOptionData(optionId);
        let blockTimestamp = await (await web3.eth.getBlock(await web3.eth.getBlockNumber())).timestamp;
        const bid: Bid = {
            id: 2,
            price: toEth(price),
            tokenAddress: token.address,
            collection: testNft.address,
            orderExpiry: Number(blockTimestamp) + 20,
            buyer,
            optionType: optionData.optionType,
            strikePrice: optionData.strikePrice,
            expiry: optionData.expiry,
            expiryAllowance: 0,
            optionTokenAddress: '0x0000000000000000000000000000000000000000',
        };

        const signature = await signBidWithEIP712(bid, conduit.address, buyerPrivateKey); // buyer signs it
        truffleAssert.reverts(
            conduit.acceptBid(optionId, pool.address, bid, signature, metadata(optionOwner)),
            "Option liquidity doesn't match"
        )
    });

    it("Accept bid", async () => {
        const price = 1;
        let optionOwner = await option.ownerOf(optionId);

        await option.setApprovalForAll(conduit.address, true, metadata(optionOwner));

        const optionData: OptionData = await pool.getOptionData(optionId);
        let blockTimestamp = await (await web3.eth.getBlock(await web3.eth.getBlockNumber())).timestamp;
        const bid: Bid = {
            id: 2,
            price: toEth(price),
            tokenAddress: token.address,
            collection: testNft.address,
            orderExpiry: Number(blockTimestamp) + 20,
            buyer,
            optionType: optionData.optionType,
            strikePrice: optionData.strikePrice,
            expiry: optionData.expiry,
            expiryAllowance: 0,
            optionTokenAddress: token.address,
        };

        const signature = await signBidWithEIP712(bid, conduit.address, buyerPrivateKey); // buyer signs it

        // Fee Manager
        const royaltyReceiver = await feeManager.owner()
        const initialRoyaltyReceiverBalance = await token.balanceOf(royaltyReceiver);
        
        const initialBalanceBuyer = await token.balanceOf(bid.buyer);
        const initialBalanceSeller = await token.balanceOf(optionOwner);
        const acceptBidResult = await conduit.acceptBid(optionId, pool.address, bid, signature, metadata(optionOwner));
        const finalBalanceBuyer = await token.balanceOf(bid.buyer);
        const finalBalanceSeller = await token.balanceOf(optionOwner);
        const finalRoyaltyReceiverBalance = await token.balanceOf(royaltyReceiver);

        truffleAssert.eventEmitted(acceptBidResult, "BidTaken", null, "Bid wasn't taken");
        assert.equal(await option.ownerOf(optionId), buyer, "Option not owned after buying");
        assert.equal(fromWei(initialBalanceBuyer.sub(finalBalanceBuyer)), price, 'Buyer incorrect balance change')
        
        const royaltyAmount = price * royaltyPayoutPercent / 1000;
        const sellerAmount = price - royaltyAmount;
        assert.equal(fromWei(finalBalanceSeller.sub(initialBalanceSeller)), sellerAmount, 'Seller incorrect balance change')

        // Fee Manager
        assert.equal(fromWei(finalRoyaltyReceiverBalance.sub(initialRoyaltyReceiverBalance)), royaltyAmount, 'Fee receiver incorrect balance change')
    });

    it("PoolAcceptBid with invalid pool address", async () => {
        const price = 1;
        const strikePrice = 10;
        let blockTimestamp = await (await web3.eth.getBlock(await web3.eth.getBlockNumber())).timestamp;
        const bid: Bid = {
            id: 3,
            price: toEth(price),
            tokenAddress: token.address,
            collection: testNft.address,
            orderExpiry: Number(blockTimestamp) + 20,
            buyer,
            optionType: OptionType.CALL,
            strikePrice: toEth(strikePrice),
            expiry: Number(blockTimestamp) + 20000,
            expiryAllowance: 0,
            optionTokenAddress: token.address,
        };

        const signature = await signBidWithEIP712(bid, conduit.address, buyerPrivateKey); // buyer signs it
        await truffleAssert.reverts(conduit.poolAcceptBid(bid, signature, 0, metadata(lp)), "Pool is not valid");
    });

    it("Cancel ask", async () => {
        const price = 1;
        let optionOwner = await option.ownerOf(optionId);

        await option.setApprovalForAll(conduit.address, true, metadata(optionOwner));

        let blockTimestamp = await (await web3.eth.getBlock(await web3.eth.getBlockNumber())).timestamp;
        const ask: Ask = {
            id: 3,
            optionId: optionId.toString(),
            orderExpiry: Number(blockTimestamp) + 20,
            price: toEth(price),
            seller: optionOwner,
            tokenAddress: token.address,
        };

        const signature = await signAskWithEIP712(ask, conduit.address, buyerPrivateKey);

        await truffleAssert.reverts(
            conduit.cancelAsk(ask, signature, metadata(someoneElse)),
            "Only the signer can cancel",
            "Can execute cancelled ask"
        );
        const cancelAskResult = await conduit.cancelAsk(ask, signature, metadata(buyer));
        truffleAssert.eventEmitted(cancelAskResult, "AskCancelled", null, "Ask wasn't cancelled");

        await truffleAssert.reverts(
            conduit.acceptAsk(ask, signature, metadata(someoneElse)),
            "Order was finalized or cancelled",
            "Can execute cancelled ask"
        );
    });

    it("Cancel bid", async () => {
        const price = 1;
        let optionOwner = await option.ownerOf(optionId);

        await option.setApprovalForAll(conduit.address, true, metadata(optionOwner));

        const optionData: OptionData = await pool.getOptionData(optionId);

        let blockTimestamp = await (await web3.eth.getBlock(await web3.eth.getBlockNumber())).timestamp;
        const bid: Bid = {
            id: 4,
            price,
            tokenAddress: token.address,
            collection: testNft.address,
            orderExpiry: Number(blockTimestamp) + 20,
            buyer: someoneElse,
            optionType: optionData.optionType,
            strikePrice: optionData.strikePrice,
            expiry: optionData.expiry,
            expiryAllowance: 0,
            optionTokenAddress: token.address,
        };

        const signature = await signBidWithEIP712(bid, conduit.address, someoneElsePrivateKey); // buyer signs it
        const cancelBidResult = await conduit.cancelBid(bid, signature, metadata(someoneElse));
        truffleAssert.eventEmitted(cancelBidResult, "BidCancelled", null, "Bid wasn't cancelled");

        await truffleAssert.reverts(
            conduit.acceptBid(optionId, pool.address, bid, signature, metadata(optionOwner)),
            "Order was finalized or cancelled",
            "Can execute cancelled bid"
        );
    });
});
