const truffleAssert = require('truffle-assertions');

import { toEth, toBN, makeRequest, makeConfig, metadata, signRequest, signBidWithEIP712 } from "./util/TestUtils";
import { OptionRequest, OptionType, ZERO_ADDRESS ,Bid } from "./util/TestTypes";
import { TestERC721Instance } from "../types/truffle-contracts/TestERC721.js";
import { WasabiPoolFactoryInstance } from "../types/truffle-contracts/WasabiPoolFactory.js";
import { WasabiConduitInstance } from "../types/truffle-contracts";
import { WasabiOptionInstance } from "../types/truffle-contracts/WasabiOption.js";
import { ERC20WasabiPoolInstance, OptionIssued, OptionExecuted } from "../types/truffle-contracts/ERC20WasabiPool.js";
import { DemoETHInstance } from "../types/truffle-contracts";

const Signing = artifacts.require("Signing");
const WasabiPoolFactory = artifacts.require("WasabiPoolFactory");
const WasabiConduitFactory = artifacts.require("WasabiConduit");
const WasabiOption = artifacts.require("WasabiOption");
const ERC20WasabiPool = artifacts.require("ERC20WasabiPool");
const TestERC721 = artifacts.require("TestERC721");
const DemoETH = artifacts.require("DemoETH");

contract("ERC20WasabiPool: CallOption", accounts => {
    let token: DemoETHInstance;
    let poolFactory: WasabiPoolFactoryInstance;
    let conduit: WasabiConduitInstance;
    let option: WasabiOptionInstance;
    let testNft: TestERC721Instance;
    let poolAddress: string;
    let pool: ERC20WasabiPoolInstance;
    let optionId: BN;
    let request: OptionRequest;

    const lp = accounts[2];
    const buyer = accounts[3];
    const someoneElse = accounts[5];
    const buyerPrivateKey = "c88b703fb08cbea894b6aeff5a544fb92e78a18e19814cd85da83b71f772aa6c";
    const lpPrivateKey = "0dbbe8e4ae425a6d2687f1a7e3ba17bc98c673636790f1b8ad91193c05875ef1";

    before("Prepare State", async function () {
        token = await DemoETH.deployed();
        testNft = await TestERC721.deployed();
        await Signing.deployed();
        option = await WasabiOption.deployed();
        poolFactory = await WasabiPoolFactory.deployed();
        conduit = await WasabiConduitFactory.deployed();
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
        let blockNumber = await web3.eth.getBlockNumber();
        let maxBlockToExecute = blockNumber + 5;
        const premium = 1;
        const allowed = premium * 2;

        request = makeRequest(pool.address, OptionType.CALL, 10, premium, 263000, 1001, maxBlockToExecute); // no premium in request
        await truffleAssert.reverts(
            pool.writeOption.sendTransaction(request, await signRequest(request, lp), metadata(buyer)),
            "Not enough premium is supplied",
            "No permission given to transfer enough tokens");

        await token.approve(pool.address, toEth(allowed), metadata(buyer));

        maxBlockToExecute = blockNumber - 2;
        request = makeRequest(pool.address, OptionType.CALL, 0, premium, 263000, 1001, maxBlockToExecute); // no strike price in request
        await truffleAssert.reverts(
            pool.writeOption(request, await signRequest(request, lp), metadata(buyer, 1)),
            "Max block to execute has passed",
            "Max block to execute has passed");

        maxBlockToExecute = blockNumber + 5;

        request = makeRequest(pool.address, OptionType.CALL, 0, premium, 263000, 1001, maxBlockToExecute); // no strike price in request
        await truffleAssert.reverts(
            pool.writeOption(request, await signRequest(request, lp), metadata(buyer)),
            "Strike price must be set",
            "Strike price must be set");
        
        request = makeRequest(pool.address, OptionType.CALL, 10, 0, 263000, 1001, maxBlockToExecute); // no premium in request
        await truffleAssert.reverts(
            pool.writeOption.sendTransaction(request, await signRequest(request, lp), metadata(buyer)),
            "Not enough premium is supplied",
            "Cannot write option when premium is 0");

        request = makeRequest(pool.address, OptionType.CALL, 10, allowed + 0.1, 263000, 1001, maxBlockToExecute);
        await truffleAssert.reverts(
            pool.writeOption.sendTransaction(request, await signRequest(request, lp), metadata(buyer)), // not sending enough premium
            "Not enough premium is supplied",
            "Premium paid doesn't match the premium of the request");

        const request2 = makeRequest(pool.address, OptionType.CALL, 9, premium, 263000, 1001, maxBlockToExecute);
        await truffleAssert.reverts(
            pool.writeOption.sendTransaction(request, await signRequest(request2, someoneElse), metadata(buyer)),
            "Signature not valid",
            "Signed object and provided object are different");

        const emptySignature = "0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";
        await truffleAssert.reverts(
            pool.writeOption.sendTransaction(request, emptySignature, metadata(buyer)),
            "Signature not valid",
            "Invalid signature");

        await truffleAssert.reverts(
            pool.writeOption.sendTransaction(request, await signRequest(request, someoneElse), metadata(buyer)),
            "Signature not valid",
            "Must be signed by owner");

        request = makeRequest(pool.address, OptionType.CALL, 10, premium, 263000, 1001, maxBlockToExecute);
    });

    it("Write Option (only owner)", async () => {

        const writeOptionResult = await pool.writeOption(request, await signRequest(request, lp), metadata(buyer));
        truffleAssert.eventEmitted(writeOptionResult, "OptionIssued", null, "Asset wasn't locked");
        assert.equal(await token.balanceOf(pool.address), request.premium, "Incorrect balance in pool");

        const log = writeOptionResult.logs.find(l => l.event == "OptionIssued")! as Truffle.TransactionLog<OptionIssued>;
        optionId = log.args.optionId;

        assert.equal(await option.ownerOf(optionId), buyer, "Buyer not the owner of option");
        const expectedOptionId = await pool.getOptionIdForToken(request.tokenId);
        assert.equal(expectedOptionId.toNumber(), optionId.toNumber(), "Option of token not correct");

        await truffleAssert.reverts(
            pool.writeOption.sendTransaction(request, await signRequest(request, lp), metadata(buyer)),
            "Token is locked",
            "Cannot (re)write an option for a locked asset");
    });

    it("Accept Call Bid with tokenId - (only owner)", async () => {
        const price = 1;
        const strikePrice = 10;
        let blockTimestamp = await (await web3.eth.getBlock(await web3.eth.getBlockNumber())).timestamp;
        const bid: Bid = {
            id: 2,
            price: toEth(price),
            tokenAddress: token.address,
            collection: testNft.address,
            orderExpiry: Number(blockTimestamp) + 20,
            buyer,
            optionType: OptionType.CALL,
            strikePrice: toEth(strikePrice),
            expiry: Number(blockTimestamp) + 20000,
            expiryAllowance: 0,
        };

        const tokenIds = await pool.getAllTokenIds();
        let tokenId = 0;
        for (let i = 0; i < tokenIds.length; i++) {
            if (await pool.isAvailableTokenId(tokenIds[i])){
                tokenId = tokenIds[i].toNumber();
                break;
            }
        }
        // Owner Set Conduit Address
        await pool.setConduitAddress(conduit.address, metadata(lp));
        await conduit.setPoolFactoryAddress(poolFactory.address);
        const signature = await signBidWithEIP712(bid, conduit.address, buyerPrivateKey); // buyer signs it
        await token.approve(conduit.address, toEth(price), metadata(buyer)); // Approve tokens

        const prev_pool_balance = await token.balanceOf(pool.address);
        const acceptBidResult = await pool.methods["acceptBid((uint256,uint256,address,address,uint256,address,uint8,uint256,uint256,uint256),bytes,uint256)"](bid, signature, tokenId, metadata(lp));
        const after_pool_balance = await token.balanceOf(pool.address);
        const optionId = await pool.getOptionIdForToken(tokenId);
        
        assert.equal(await option.ownerOf(optionId), buyer, "Buyer not the owner of option");
        assert.equal((prev_pool_balance.add(toBN(toEth(price)))).toString(), after_pool_balance.toString());
    });

    it("Accept Call Bid without tokenId - (only owner)", async () => {
        const price = 1;
        const strikePrice = 10;
        let blockTimestamp = await (await web3.eth.getBlock(await web3.eth.getBlockNumber())).timestamp;
        const bid: Bid = {
            id: 2,
            price: toEth(price),
            tokenAddress: token.address,
            collection: testNft.address,
            orderExpiry: Number(blockTimestamp) + 20,
            buyer,
            optionType: OptionType.CALL,
            strikePrice: toEth(strikePrice),
            expiry: Number(blockTimestamp) + 20000,
            expiryAllowance: 0,
        };

        // Owner Set Conduit Address
        await pool.setConduitAddress(conduit.address, metadata(lp));
        await conduit.setPoolFactoryAddress(poolFactory.address);
        const signature = await signBidWithEIP712(bid, conduit.address, buyerPrivateKey); // buyer signs it

        await token.approve(conduit.address, toEth(price), metadata(buyer)); // Approve tokens

        const prev_pool_balance = await token.balanceOf(pool.address);
        await pool.methods["acceptBid((uint256,uint256,address,address,uint256,address,uint8,uint256,uint256,uint256),bytes)"] (bid, signature, metadata(lp));

        const after_pool_balance = await token.balanceOf(pool.address);
        
        assert.equal((prev_pool_balance.add(toBN(toEth(price)))).toString(), after_pool_balance.toString());
    });

    it("Accept Call Bid with invalid tokenId - (only owner)", async () => {
        const price = 1;
        const strikePrice = 10;
        let blockTimestamp = await (await web3.eth.getBlock(await web3.eth.getBlockNumber())).timestamp;
        const bid: Bid = {
            id: 2,
            price: toEth(price),
            tokenAddress: token.address,
            collection: testNft.address,
            orderExpiry: Number(blockTimestamp) + 20,
            buyer,
            optionType: OptionType.CALL,
            strikePrice: toEth(strikePrice),
            expiry: Number(blockTimestamp) + 20000,
            expiryAllowance: 0,
        };
        let tokenId = 0;

        // Owner Set Conduit Address
        await pool.setConduitAddress(conduit.address, metadata(lp));
        await conduit.setPoolFactoryAddress(poolFactory.address);
        const signature = await signBidWithEIP712(bid, conduit.address, buyerPrivateKey); // buyer signs it

        await truffleAssert.reverts(pool.methods["acceptBid((uint256,uint256,address,address,uint256,address,uint8,uint256,uint256,uint256),bytes,uint256)"] (bid, signature, tokenId, metadata(lp)), "WasabiPool: tokenId is not valid");
    });

    it("Accept Call Bid with not owner - (only owner)", async () => {
        const price = 1;
        const strikePrice = 10;
        let blockTimestamp = await (await web3.eth.getBlock(await web3.eth.getBlockNumber())).timestamp;
        const bid: Bid = {
            id: 2,
            price: toEth(price),
            tokenAddress: token.address,
            collection: testNft.address,
            orderExpiry: Number(blockTimestamp) + 20,
            buyer,
            optionType: OptionType.CALL,
            strikePrice: toEth(strikePrice),
            expiry: Number(blockTimestamp) + 20000,
            expiryAllowance: 0,
        };

        let tokenId = 0;

        const signature = await signBidWithEIP712(bid, conduit.address, buyerPrivateKey); // buyer signs it
        await truffleAssert.reverts(pool.methods["acceptBid((uint256,uint256,address,address,uint256,address,uint8,uint256,uint256,uint256),bytes,uint256)"](bid, signature, tokenId, metadata(buyer)), "Ownable: caller is not the owner");
    });
    
});
