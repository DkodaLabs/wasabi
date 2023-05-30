const truffleAssert = require('truffle-assertions');

import { toEth, toBN, metadata, signBidWithEIP712, expectRevertCustomError, getAllTokenIds } from "./util/TestUtilsV2";
import { OptionType, ZERO_ADDRESS ,Bid } from "./util/TestTypesV2";
import { TestERC721Instance } from "../types/truffle-contracts/TestERC721.js";
import { WasabiPoolFactoryV2Instance } from "../types/truffle-contracts/WasabiPoolFactoryV2.js";
import { WasabiConduitV2Instance } from "../types/truffle-contracts";
import { WasabiOptionInstance } from "../types/truffle-contracts/WasabiOption.js";
import { ERC20WasabiPoolV2Instance } from "../types/truffle-contracts/ERC20WasabiPoolV2.js";
import { DemoETHInstance } from "../types/truffle-contracts";
import { OptionIssued } from "../types/truffle-contracts/IWasabiPool";

const SigningV2 = artifacts.require("SigningV2");
const WasabiPoolFactoryV2 = artifacts.require("WasabiPoolFactoryV2");
const WasabiConduitFactory = artifacts.require("WasabiConduitV2");
const WasabiOption = artifacts.require("WasabiOption");
const ERC20WasabiPoolV2 = artifacts.require("ERC20WasabiPoolV2");
const TestERC721 = artifacts.require("TestERC721");
const DemoETH = artifacts.require("DemoETH");

contract("ERC20WasabiPoolV2: Accept Bid From Pool", accounts => {
    let token: DemoETHInstance;
    let poolFactory: WasabiPoolFactoryV2Instance;
    let conduit: WasabiConduitV2Instance;
    let option: WasabiOptionInstance;
    let testNft: TestERC721Instance;
    let poolAddress: string;
    let pool: ERC20WasabiPoolV2Instance;

    const owner = accounts[0];
    const lp = accounts[2];
    const buyer = accounts[3];
    const someoneElse = accounts[5];
    const buyerPrivateKey = "c88b703fb08cbea894b6aeff5a544fb92e78a18e19814cd85da83b71f772aa6c";
    const lpPrivateKey = "0dbbe8e4ae425a6d2687f1a7e3ba17bc98c673636790f1b8ad91193c05875ef1";

    before("Prepare State", async function () {
        token = await DemoETH.deployed();
        testNft = await TestERC721.deployed();
        await SigningV2.deployed();
        option = await WasabiOption.deployed();
        poolFactory = await WasabiPoolFactoryV2.deployed();
        conduit = await WasabiConduitFactory.deployed();
        await option.toggleFactory(poolFactory.address, true);
        await conduit.setPoolFactoryAddress(poolFactory.address);
        await conduit.setOption(option.address);
        await poolFactory.setConduitAddress(conduit.address);
        
        await token.mint(metadata(buyer));
        await token.mint(metadata(lp));

        await testNft.mint(metadata(lp));
        await testNft.mint(metadata(lp));
        await testNft.mint(metadata(lp));
        await testNft.mint(metadata(lp));
        await testNft.mint(metadata(someoneElse));
        await testNft.mint(metadata(buyer));
        await testNft.mint(metadata(buyer));

    });
    
    it("Create Pool", async () => {
        assert.equal((await token.balanceOf(buyer)).toString(), toEth(100), 'Not enough minted');

        const createPoolResult =
            await poolFactory.createERC20Pool(
                token.address,
                0,
                [testNft.address],
                lp,
                metadata(lp));
        truffleAssert.eventEmitted(createPoolResult, "NewPool", null, "Pool wasn't created");
        truffleAssert.eventEmitted(createPoolResult, "OwnershipTransferred", { previousOwner: ZERO_ADDRESS, newOwner: lp }, "Pool didn't change owners correctly");

        poolAddress = createPoolResult.logs.find(e => e.event == "NewPool")!.args[0];
        pool = await ERC20WasabiPoolV2.at(poolAddress);

        await testNft.setApprovalForAll.sendTransaction(poolAddress, true, metadata(lp));

        assert.equal(await pool.owner(), lp, "Pool creator and owner not same");
        assert.deepEqual(await getAllTokenIds(lp, testNft), [1001, 1002, 1003, 1004], "Pool doesn't have the correct tokens");

        assert.equal(await pool.getLiquidityAddress(), token.address, 'Token not correct');
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
            optionTokenAddress: token.address
        };

        const tokenIds = await getAllTokenIds(lp, testNft);
        let tokenId = 0;
        for (let i = 0; i < tokenIds.length; i++) {
            tokenId = tokenIds[i].valueOf();
            break;
            
        }
        // Factory Owner Sets Conduit Address
        await poolFactory.setConduitAddress(conduit.address, metadata(owner));

        await conduit.setPoolFactoryAddress(poolFactory.address);
        const signature = await signBidWithEIP712(bid, conduit.address, buyerPrivateKey); // buyer signs it
        await token.approve(conduit.address, toEth(price), metadata(buyer)); // Approve tokens

        const prev_pool_balance = await token.balanceOf(pool.address);
        const acceptBidResult = await pool.acceptBid(bid, signature, tokenId, metadata(lp));

        const log = acceptBidResult.logs.find(l => l.event == "OptionIssued")! as Truffle.TransactionLog<OptionIssued>;
        const optionId = log.args.optionId;

        const after_pool_balance = await token.balanceOf(pool.address);
        
        assert.equal(await option.ownerOf(optionId), buyer, "Buyer not the owner of option");
        assert.equal((prev_pool_balance.add(toBN(toEth(price)))).toString(), after_pool_balance.toString());
    });

    it("Accept Call Bid without tokenId - (only owner)", async () => {
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
            optionTokenAddress: token.address
        };

        // Factory Owner Sets Conduit Address
        await poolFactory.setConduitAddress(conduit.address, metadata(owner));

        await conduit.setPoolFactoryAddress(poolFactory.address);
        const signature = await signBidWithEIP712(bid, conduit.address, buyerPrivateKey); // buyer signs it

        await token.approve(conduit.address, toEth(price), metadata(buyer)); // Approve tokens

        const prev_pool_balance = await token.balanceOf(pool.address);

        const tokenIds = await getAllTokenIds(lp, testNft);
        let tokenId = 0;
        for (let i = 0; i < tokenIds.length; i++) {
            tokenId = tokenIds[i].valueOf();
            break;
            
        }
        await pool.acceptBid(bid, signature, tokenId, metadata(lp));

        const after_pool_balance = await token.balanceOf(pool.address);
        
        assert.equal((prev_pool_balance.add(toBN(toEth(price)))).toString(), after_pool_balance.toString());
    });

    it("Accept Call Bid without tokenId - (only owner) should be failed if bid already finished or cancelled", async () => {
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
            optionTokenAddress: token.address
        };

        // Factory Owner Sets Conduit Address
        await poolFactory.setConduitAddress(conduit.address, metadata(owner));

        await conduit.setPoolFactoryAddress(poolFactory.address);
        const signature = await signBidWithEIP712(bid, conduit.address, buyerPrivateKey); // buyer signs it

        await token.approve(conduit.address, toEth(price), metadata(buyer)); // Approve tokens

        const tokenIds = await getAllTokenIds(lp, testNft);
        let tokenId = 0;
        for (let i = 0; i < tokenIds.length; i++) {
            tokenId = tokenIds[i].valueOf();
            break;
            
        }
        await truffleAssert.reverts(pool.acceptBid(bid, signature, tokenId, metadata(lp)), "Order was finalized or cancelled");
    });

    it("Accept Call Bid with invalid tokenId - (only owner)", async () => {
        const price = 1;
        const strikePrice = 10;
        let blockTimestamp = await (await web3.eth.getBlock(await web3.eth.getBlockNumber())).timestamp;
        const bid: Bid = {
            id: 10,
            price: toEth(price),
            tokenAddress: token.address,
            collection: testNft.address,
            orderExpiry: Number(blockTimestamp) + 20,
            buyer,
            optionType: OptionType.CALL,
            strikePrice: toEth(strikePrice),
            expiry: Number(blockTimestamp) + 20000,
            expiryAllowance: 0,
            optionTokenAddress: token.address
        };

        // Factory Owner Sets Conduit Address
        await poolFactory.setConduitAddress(conduit.address, metadata(owner));
        await conduit.setPoolFactoryAddress(poolFactory.address);
        const signature = await signBidWithEIP712(bid, conduit.address, buyerPrivateKey); // buyer signs it

        await expectRevertCustomError(
            pool.acceptBid(bid, signature, 1001, metadata(lp)),
            "NftIsInvalid");
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
            optionTokenAddress: token.address
        };

        let tokenId = 0;

        const signature = await signBidWithEIP712(bid, conduit.address, buyerPrivateKey); // buyer signs it
        await truffleAssert.reverts(pool.acceptBid(bid, signature, tokenId, metadata(buyer)), "Ownable: caller is not the owner");
    });
});
