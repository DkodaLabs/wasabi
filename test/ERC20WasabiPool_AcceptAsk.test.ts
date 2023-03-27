const truffleAssert = require('truffle-assertions');

import { toEth, toBN, makeRequest, makeConfig, metadata, signRequest, signAskWithEIP712, fromWei } from "./util/TestUtils";
import { PoolAsk, OptionType, ZERO_ADDRESS ,Bid, Ask} from "./util/TestTypes";
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

contract("ERC20WasabiPool: Accept Bid From Pool", accounts => {
    let token: DemoETHInstance;
    let poolFactory: WasabiPoolFactoryInstance;
    let conduit: WasabiConduitInstance;
    let option: WasabiOptionInstance;
    let testNft: TestERC721Instance;
    let poolAddress: string;
    let pool: ERC20WasabiPoolInstance;
    let optionId: BN;
    let request: PoolAsk;
    let afterRoyaltyPayoutPercent: number;

    const owner = accounts[0];
    const lp = accounts[2];
    const buyer = accounts[3];
    const someoneElse = accounts[5];
    const lpPrivateKey = "0dbbe8e4ae425a6d2687f1a7e3ba17bc98c673636790f1b8ad91193c05875ef1";

    before("Prepare State", async function () {
        token = await DemoETH.deployed();
        testNft = await TestERC721.deployed();
        await Signing.deployed();
        option = await WasabiOption.deployed();
        poolFactory = await WasabiPoolFactory.deployed();
        conduit = await WasabiConduitFactory.deployed();
        await option.setFactory(poolFactory.address);
        await conduit.setOption(option.address);
        await conduit.setPoolFactoryAddress(poolFactory.address);
        poolFactory.setConduitAddress(conduit.address);

        await token.mint(metadata(buyer));
        await token.mint(metadata(lp));

        await testNft.mint(metadata(lp));
        await testNft.mint(metadata(lp));
        await testNft.mint(metadata(lp));
        await testNft.mint(metadata(lp));
        await testNft.mint(metadata(someoneElse));
        await testNft.mint(metadata(buyer));
        await testNft.mint(metadata(buyer));

        afterRoyaltyPayoutPercent = 1 - (await option.royaltyPercent()).toNumber() / 100;
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
                [1001, 1002, 1003, 1004],
                config,
                types,
                ZERO_ADDRESS,
                metadata(lp));
        truffleAssert.eventEmitted(createPoolResult, "NewPool", null, "Pool wasn't created");
        truffleAssert.eventEmitted(createPoolResult, "OwnershipTransferred", { previousOwner: ZERO_ADDRESS, newOwner: lp }, "Pool didn't change owners correctly");

        poolAddress = createPoolResult.logs.find(e => e.event == "NewPool")!.args[0];
        pool = await ERC20WasabiPool.at(poolAddress);
        assert.equal(await pool.owner(), lp, "Pool creator and owner not same");
        assert.deepEqual((await pool.getAllTokenIds()).map(a => a.toNumber()), [1001, 1002, 1003, 1004], "Pool doesn't have the correct tokens");

        assert.equal(await pool.getLiquidityAddress(), token.address, 'Token not correct');
    });

    it("Write Option (only owner)", async () => {
        const id = 1;
        let blockNumber = await web3.eth.getBlockNumber();
        let timestamp = Number((await web3.eth.getBlock(blockNumber)).timestamp);
        let expiry = timestamp + 10000;
        let orderExpiry = timestamp + 10000;
        const premium = 1;
        request = makeRequest(id, pool.address, OptionType.CALL, 10, premium, expiry, 1003, orderExpiry);

        await token.approve(conduit.address, toEth(premium * 10), metadata(lp));

        const prev_pool_balance = await token.balanceOf(pool.address);
        optionId = await conduit.buyOption.call(request, await signRequest(request, lp), metadata(lp));
        await conduit.buyOption(request, await signRequest(request, lp), metadata(lp));

        const after_pool_balance = await token.balanceOf(pool.address);
        
        assert.equal((prev_pool_balance.add(toBN(request.premium))).toString(), after_pool_balance.toString());

        assert.equal(await option.ownerOf(optionId), lp, "Buyer not the owner of option");
        const expectedOptionId = await pool.getOptionIdForToken(request.tokenId);
        assert.equal(expectedOptionId.toNumber(), optionId.toNumber(), "Option of token not correct");

        request.id = request.id + 1;
        await truffleAssert.reverts(
            conduit.buyOption(request, await signRequest(request, lp), metadata(lp)),
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
            tokenAddress: token.address,
        };

        const signature = await signAskWithEIP712(ask, conduit.address, lpPrivateKey);

        const initialBalanceSeller = await token.balanceOf(optionOwner);
        const acceptAskResult = await pool.acceptAsk(ask, signature, metadata(lp));
        const finalBalanceSeller = await token.balanceOf(optionOwner);
        const resultsOfConduit= await truffleAssert.createTransactionResult(conduit, acceptAskResult.tx)

        await truffleAssert.eventEmitted(resultsOfConduit, "AskTaken", null, "Ask wasn't taken");
        
        assert.equal(fromWei(finalBalanceSeller.sub(initialBalanceSeller)), price * afterRoyaltyPayoutPercent, 'Seller incorrect balance change')
    });
    
});
