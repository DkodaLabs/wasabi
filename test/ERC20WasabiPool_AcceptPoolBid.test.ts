const truffleAssert = require('truffle-assertions');

import { toEth, toBN, makeRequest, metadata, gasOfTxn, assertIncreaseInBalance, advanceTime, expectRevertCustomError, withBid, signPoolAskWithEIP712, signPoolBidWithEIP712, getAllTokenIds } from "./util/TestUtils";
import { PoolAsk, OptionType, ZERO_ADDRESS, PoolBid } from "./util/TestTypes";
import { TestERC721Instance } from "../types/truffle-contracts/TestERC721.js";
import { WasabiPoolFactoryInstance } from "../types/truffle-contracts/WasabiPoolFactory.js";
import { WasabiOptionInstance } from "../types/truffle-contracts/WasabiOption.js";
import { ERC20WasabiPoolInstance, OptionIssued } from "../types/truffle-contracts/ERC20WasabiPool.js";
import { DemoETHInstance } from "../types/truffle-contracts";

const Signing = artifacts.require("Signing");
const WasabiPoolFactory = artifacts.require("WasabiPoolFactory");
const WasabiOption = artifacts.require("WasabiOption");
const ERC20WasabiPool = artifacts.require("ERC20WasabiPool");
const TestERC721 = artifacts.require("TestERC721");
const DemoETH = artifacts.require("DemoETH");

contract("ERC20WasabiPool: Accept Pool Bid", accounts => {
    let token: DemoETHInstance;
    let poolFactory: WasabiPoolFactoryInstance;
    let option: WasabiOptionInstance;
    let testNft: TestERC721Instance;
    let poolAddress: string;
    let pool: ERC20WasabiPoolInstance;
    let callOptionId: BN;
    let putOptionId: BN;
    let request: PoolAsk;


    const lp = accounts[2];
    const buyer = accounts[3];
    const someoneElse = accounts[5];

    const lpPrivateKey = "0dbbe8e4ae425a6d2687f1a7e3ba17bc98c673636790f1b8ad91193c05875ef1";
    const buyerPrivateKey = "c88b703fb08cbea894b6aeff5a544fb92e78a18e19814cd85da83b71f772aa6c";

    const duration = 10000;
    const premium = 1;
    const strike = 10;

    var signature;

    before("Prepare State", async function () {
        token = await DemoETH.deployed();
        testNft = await TestERC721.deployed();
        await Signing.deployed();
        option = await WasabiOption.deployed();
        poolFactory = await WasabiPoolFactory.deployed();
        await option.toggleFactory(poolFactory.address, true);
        
        await token.mint(metadata(lp));
        await token.mint(metadata(buyer));

        await testNft.mint(metadata(lp));
        await testNft.mint(metadata(lp));
        await testNft.mint(metadata(lp));
        await testNft.mint(metadata(buyer));
        await testNft.mint(metadata(buyer));
        await testNft.mint(metadata(buyer));
    });
    
    it("Create Pool", async () => {
        await testNft.setApprovalForAll.sendTransaction(poolFactory.address, true, metadata(lp));

        const initialPoolBalance = toEth(10);
        await token.approve(poolFactory.address, initialPoolBalance, metadata(lp));
        const createPoolResult =
            await poolFactory.createERC20Pool(
                token.address,
                initialPoolBalance,
                testNft.address,
                [1001, 1002, 1003],
                ZERO_ADDRESS,
                metadata(lp));
        truffleAssert.eventEmitted(createPoolResult, "NewPool", null, "Pool wasn't created");
        truffleAssert.eventEmitted(createPoolResult, "OwnershipTransferred", { previousOwner: ZERO_ADDRESS, newOwner: lp }, "Pool didn't change owners correctly");

        poolAddress = createPoolResult.logs.find(e => e.event == "NewPool")!.args[0];
        pool = await ERC20WasabiPool.at(poolAddress);
        assert.equal(await pool.owner(), lp, "Pool creator and owner not same");
        assert.deepEqual(await getAllTokenIds(pool.address, testNft), [1001, 1002, 1003], "Pool doesn't have the correct tokens");

        assert.equal(await pool.getLiquidityAddress(), token.address, 'Token not correct');
    });

    it("Write Option (only owner)", async () => {
        let blockNumber = await web3.eth.getBlockNumber();
        let timestamp = Number((await web3.eth.getBlock(blockNumber)).timestamp);
        let expiry = timestamp + duration;
        let orderExpiry = timestamp + duration;

        await token.approve(pool.address, toEth(premium * 2), metadata(buyer));

        // Write CALL and validate
        request = makeRequest(0, pool.address, OptionType.CALL, strike, premium, expiry, 1001, orderExpiry);
        signature = await signPoolAskWithEIP712(request, pool.address, lpPrivateKey);
        const callWriteOptionResult = await pool.writeOption(request, signature, metadata(buyer));
        truffleAssert.eventEmitted(callWriteOptionResult, "OptionIssued", null, "Asset wasn't locked");
        const callLog = callWriteOptionResult.logs.find(l => l.event == "OptionIssued")! as Truffle.TransactionLog<OptionIssued>;
        callOptionId = callLog.args.optionId;
        assert.equal(await option.ownerOf(callOptionId), buyer, "Buyer not the owner of option");
        assert.equal(
            (await pool.getOptionIdForToken(request.tokenId)).toNumber(),
            callOptionId.toNumber(), 
            "Option of token not correct");

        // Write PUT and validate
        request = makeRequest(1, pool.address, OptionType.PUT, strike, premium, expiry, 1001, orderExpiry);
        signature = await signPoolAskWithEIP712(request, pool.address, lpPrivateKey);
        const putWriteOptionResult = await pool.writeOption(request, signature, metadata(buyer));
        truffleAssert.eventEmitted(putWriteOptionResult, "OptionIssued", null, "Asset wasn't locked");
        const putLog = putWriteOptionResult.logs.find(l => l.event == "OptionIssued")! as Truffle.TransactionLog<OptionIssued>;
        putOptionId = putLog.args.optionId;
        assert.equal(await option.ownerOf(putOptionId), buyer, "Buyer not the owner of option");
    });

    it("Accept pool bid CALL (only option holder)", async () => {
        let blockNumber = await web3.eth.getBlockNumber();
        let timestamp = Number((await web3.eth.getBlock(blockNumber)).timestamp);
        let orderExpiry = timestamp - duration;

        let poolBid: PoolBid = {
            id: 1000,
            price: toEth(2),
            tokenAddress: token.address,
            orderExpiry,
            optionId: callOptionId.toString()
        }

        signature = await signPoolBidWithEIP712(poolBid, pool.address, buyerPrivateKey);
        await expectRevertCustomError(
            pool.acceptPoolBid(poolBid, signature, metadata(buyer)), 'InvalidSignature', 'Order can only be signer by pool creator');

        signature = await signPoolBidWithEIP712(poolBid, pool.address, lpPrivateKey);
        await expectRevertCustomError(
            pool.acceptPoolBid(poolBid, signature, metadata(buyer)), 'HasExpired', 'Expired order cannot be taken');
        orderExpiry = timestamp + duration;
        
        poolBid.id = 1; // id was used to issue the option
        poolBid.orderExpiry = orderExpiry;
        signature = await signPoolBidWithEIP712(poolBid, pool.address, lpPrivateKey);
        await expectRevertCustomError(
            pool.acceptPoolBid(poolBid, signature, metadata(buyer)), 'OrderFilledOrCancelled', 'Order has already been filled');
        poolBid.id = 1000;
        
        poolBid.optionId = 99;
        signature = await signPoolBidWithEIP712(poolBid, pool.address, lpPrivateKey);
        await expectRevertCustomError(
            pool.acceptPoolBid(poolBid, signature, metadata(buyer)), 'HasExpired', 'Invalid or expired option');
        poolBid.optionId = callOptionId.toString();

        signature = await signPoolBidWithEIP712(poolBid, pool.address, lpPrivateKey);
        await expectRevertCustomError(
            pool.acceptPoolBid(poolBid, signature, metadata(someoneElse)), 'Unauthorized', 'Only owner can accept bid');
        
        let availableBalance = await pool.availableBalance();
        poolBid.price = availableBalance.add(toBN(toEth(1))).toString();
        signature = await signPoolBidWithEIP712(poolBid, pool.address, lpPrivateKey);
        await expectRevertCustomError(
            pool.acceptPoolBid(poolBid, signature, metadata(buyer)), 'InsufficientAvailableLiquidity', 'Not enough liquidity');
        poolBid.price = availableBalance.toString();

        signature = await signPoolBidWithEIP712(poolBid, pool.address, lpPrivateKey);
        const poolBidTakenResult = await pool.acceptPoolBid(poolBid, signature, metadata(buyer));

        await truffleAssert.reverts(
            option.ownerOf(poolBid.optionId),
            "ERC721: invalid token ID",
            "Option wasn't burned"
        );
        availableBalance = await pool.availableBalance();
        assert.equal(availableBalance.toNumber(), 0, "Not enough was used to buy option");

        truffleAssert.eventEmitted(poolBidTakenResult, "PoolBidTaken", null, "bid wasn't taken");
    })

    it("Accept pool bid PUT (only option holder)", async () => {
        let blockNumber = await web3.eth.getBlockNumber();
        let timestamp = Number((await web3.eth.getBlock(blockNumber)).timestamp);
        let orderExpiry = timestamp + duration;

        const putStrike = toBN((await pool.getOptionData(putOptionId.toString())).strikePrice);

        let poolBid: PoolBid = {
            id: 1001,
            price: putStrike.add(toBN(toEth(1))).toString(),
            tokenAddress: token.address,
            orderExpiry,
            optionId: putOptionId.toString()
        }
        
        signature = await signPoolBidWithEIP712(poolBid, pool.address, lpPrivateKey);
        await expectRevertCustomError(
            pool.acceptPoolBid(poolBid, signature, metadata(buyer)), 'InsufficientAvailableLiquidity', 'Not enough liquidity');

        // Can use the eth locked for put option
        poolBid.price = putStrike.toString();
        signature = await signPoolBidWithEIP712(poolBid, pool.address, lpPrivateKey);
        const poolBidTakenResult = await pool.acceptPoolBid(poolBid, signature, metadata(buyer));

        await truffleAssert.reverts(
            option.ownerOf(poolBid.optionId),
            "ERC721: invalid token ID",
            "Option wasn't burned"
        );

        truffleAssert.eventEmitted(poolBidTakenResult, "PoolBidTaken", null, "bid wasn't taken");
    })
});
