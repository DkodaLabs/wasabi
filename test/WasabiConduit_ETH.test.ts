const truffleAssert = require('truffle-assertions');

import { toEth, toBN, makeRequest, makeConfig, metadata, signRequest, gasOfTxn, assertIncreaseInBalance, advanceTime, signAsk, signBid } from "./util/TestUtils";
import { Ask, Bid, OptionRequest, OptionType, ZERO_ADDRESS, OptionData } from "./util/TestTypes";
import { TestERC721Instance } from "../types/truffle-contracts/TestERC721.js";
import { WasabiPoolFactoryInstance } from "../types/truffle-contracts/WasabiPoolFactory.js";
import { WasabiOptionInstance } from "../types/truffle-contracts/WasabiOption.js";
import { ETHWasabiPoolInstance, OptionIssued, OptionExecuted } from "../types/truffle-contracts/ETHWasabiPool.js";
import { Transfer } from "../types/truffle-contracts/ERC721";
import { WasabiConduitInstance } from "../types/truffle-contracts/WasabiConduit";

const Signing = artifacts.require("Signing");
const WasabiPoolFactory = artifacts.require("WasabiPoolFactory");
const WasabiOption = artifacts.require("WasabiOption");
const ETHWasabiPool = artifacts.require("ETHWasabiPool");
const TestERC721 = artifacts.require("TestERC721");
const WasabiConduit = artifacts.require("WasabiConduit");

contract("WasabiConduit ETH", accounts => {
    let poolFactory: WasabiPoolFactoryInstance;
    let option: WasabiOptionInstance;
    let testNft: TestERC721Instance;
    let poolAddress: string;
    let pool: ETHWasabiPoolInstance;
    let optionId: BN;
    let request: OptionRequest;
    let conduit: WasabiConduitInstance;

    const admin = accounts[0];
    const lp = accounts[2];
    const buyer = accounts[3];
    const someoneElse = accounts[5];

    before("Prepare State", async function () {
        conduit = await WasabiConduit.deployed();
        testNft = await TestERC721.deployed();
        await Signing.deployed();
        option = await WasabiOption.deployed();
        poolFactory = await WasabiPoolFactory.deployed();
        await option.setFactory(poolFactory.address);

        await conduit.setOption(option.address);

        await testNft.mint(metadata(lp));
        await testNft.mint(metadata(lp));
        await testNft.mint(metadata(lp));
    });
    
    it("Create Pool", async () => {
        await testNft.setApprovalForAll.sendTransaction(poolFactory.address, true, metadata(lp));

        const config = makeConfig(1, 100, 222, 2630000 /* one month */);
        const types = [OptionType.CALL];
        const createPoolResult = await poolFactory.createPool(testNft.address, [1001, 1002, 1003], config, types, admin, metadata(lp));
        truffleAssert.eventEmitted(createPoolResult, "NewPool", null, "Pool wasn't created");
        truffleAssert.eventEmitted(createPoolResult, "OwnershipTransferred", { previousOwner: ZERO_ADDRESS, newOwner: lp }, "Pool didn't change owners correctly");

        poolAddress = createPoolResult.logs.find(e => e.event == "NewPool")!.args[0];
        pool = await ETHWasabiPool.at(poolAddress);
        assert.equal(await pool.owner(), lp, "Pool creator and owner not same");
        assert.deepEqual((await pool.getAllTokenIds()).map(a => a.toNumber()), [1001, 1002, 1003], "Pool doesn't have the correct tokens");
    });

    it("Write Option (only owner)", async () => {
        let blockNumber = await web3.eth.getBlockNumber();
        const premium = 1;
        request = makeRequest(pool.address, OptionType.CALL, 10, premium, 263000, 1001, blockNumber + 5);

        optionId = await conduit.buyOption.call(request, await signRequest(request, lp), metadata(buyer, premium));
        await conduit.buyOption(request, await signRequest(request, lp), metadata(buyer, premium));

        assert.equal(await web3.eth.getBalance(pool.address), request.premium, "Incorrect balance in pool");

        assert.equal(await option.ownerOf(optionId), buyer, "Buyer not the owner of option");
        const expectedOptionId = await pool.getOptionIdForToken(request.tokenId);
        assert.equal(expectedOptionId.toNumber(), optionId.toNumber(), "Option of token not correct");

        await truffleAssert.reverts(
            pool.writeOption.sendTransaction(request, await signRequest(request, lp), metadata(buyer, 1)),
            "Token is locked",
            "Cannot (re)write an option for a locked asset");
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
            tokenAddress: ZERO_ADDRESS,
        };

        const signature = await signAsk(ask, optionOwner);

        const acceptAskResult = await conduit.acceptAsk(ask, signature, metadata(someoneElse, price));
        truffleAssert.eventEmitted(acceptAskResult, "AskTaken", null, "Ask wasn't taken");
        assert.equal(await option.ownerOf(optionId), someoneElse, "Option not owned after buying");
    });

    it("Accept bid", async () => {
        const price = 1;
        let optionOwner = await option.ownerOf(optionId);

        await option.setApprovalForAll(conduit.address, true, metadata(optionOwner));

        const optionData: OptionData = await pool.getOptionData(optionId);

        let blockTimestamp = await (await web3.eth.getBlock(await web3.eth.getBlockNumber())).timestamp;
        const bid: Bid = {
            id: 2,
            price,
            tokenAddress: ZERO_ADDRESS,
            orderExpiry: Number(blockTimestamp) + 20,
            buyer,
            optionType: optionData.optionType,
            strikePrice: optionData.strikePrice,
            expiry: optionData.expiry,
            expiryAllowance: 0,
        };

        const signature = await signBid(bid, buyer); // buyer signs it

        const acceptBidResult = await conduit.acceptBid(optionId, pool.address, bid, signature, metadata(optionOwner, price));
        truffleAssert.eventEmitted(acceptBidResult, "BidTaken", null, "Bid wasn't taken");
        assert.equal(await option.ownerOf(optionId), buyer, "Option not owned after buying");
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
            tokenAddress: ZERO_ADDRESS,
        };

        const signature = await signAsk(ask, optionOwner);
        const cancelAskResult = await conduit.cancelAsk(ask, signature);
        truffleAssert.eventEmitted(cancelAskResult, "AskCancelled", null, "Ask wasn't cancelled");

        await truffleAssert.reverts(
            conduit.acceptAsk(ask, signature, metadata(someoneElse, price)),
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
            tokenAddress: ZERO_ADDRESS,
            orderExpiry: Number(blockTimestamp) + 20,
            buyer: someoneElse,
            optionType: optionData.optionType,
            strikePrice: optionData.strikePrice,
            expiry: optionData.expiry,
            expiryAllowance: 0,
        };

        const signature = await signBid(bid, someoneElse); // buyer signs it
        const cancelBidResult = await conduit.cancelBid(bid, signature);
        truffleAssert.eventEmitted(cancelBidResult, "BidCancelled", null, "Bid wasn't cancelled");

        await truffleAssert.reverts(
            conduit.acceptBid(optionId, pool.address, bid, signature, metadata(optionOwner, price)),
            "Order was finalized or cancelled",
            "Can execute cancelled bid"
        );
    });
});
