const truffleAssert = require('truffle-assertions');

import { toEth, advanceTime, makeRequest, metadata, signAskWithEIP712, fromWei ,expectRevertCustomError, signPoolAskWithEIP712, advanceBlock, getAllTokenIds } from "./util/TestUtilsV2";
import { PoolAsk, OptionType, ZERO_ADDRESS ,Bid, Ask} from "./util/TestTypesV2";
import { TestERC721Instance } from "../types/truffle-contracts/TestERC721.js";
import { WasabiPoolFactoryV2Instance } from "../types/truffle-contracts/WasabiPoolFactoryV2.js";
import { WasabiConduitV2Instance } from "../types/truffle-contracts";
import { WasabiOptionInstance } from "../types/truffle-contracts/WasabiOption.js";
import { ERC20WasabiPoolV2Instance, OptionIssued, OptionExecuted } from "../types/truffle-contracts/ERC20WasabiPoolV2.js";
import { DemoETHInstance } from "../types/truffle-contracts";

const SigningV2 = artifacts.require("SigningV2");
const WasabiPoolFactoryV2 = artifacts.require("WasabiPoolFactoryV2");
const WasabiConduitV2Factory = artifacts.require("WasabiConduitV2");
const WasabiOption = artifacts.require("WasabiOption");
const ERC20WasabiPoolV2 = artifacts.require("ERC20WasabiPoolV2");
const TestERC721 = artifacts.require("TestERC721");
const DemoETH = artifacts.require("DemoETH");

contract("ERC20WasabiPoolV2: Clear Expired Options From Pool", accounts => {
    let token: DemoETHInstance;
    let poolFactory: WasabiPoolFactoryV2Instance;
    let conduit: WasabiConduitV2Instance;
    let option: WasabiOptionInstance;
    let testNft: TestERC721Instance;
    let poolAddress: string;
    let pool: ERC20WasabiPoolV2Instance;
    let optionId: BN;
    let request: PoolAsk;
    let afterRoyaltyPayoutPercent: number;

    const lp = accounts[2];
    const buyer = accounts[3];
    const someoneElse = accounts[5];
    const lpPrivateKey = "0dbbe8e4ae425a6d2687f1a7e3ba17bc98c673636790f1b8ad91193c05875ef1";

    before("Prepare State", async function () {
        token = await DemoETH.deployed();
        testNft = await TestERC721.deployed();
        await SigningV2.deployed();
        option = await WasabiOption.deployed();
        poolFactory = await WasabiPoolFactoryV2.deployed();
        conduit = await WasabiConduitV2Factory.deployed();
        await option.toggleFactory(poolFactory.address, true);
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

        afterRoyaltyPayoutPercent = 1;
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

    it("Write Option (only owner)", async () => {
        const id = 1;
        let blockNumber = await web3.eth.getBlockNumber();
        let timestamp = Number((await web3.eth.getBlock(blockNumber)).timestamp);
        let expiry = timestamp + 10000;
        let orderExpiry = timestamp + 10000;
        const premium = 1;
        request = makeRequest(id, pool.address, testNft.address, OptionType.CALL, 10, premium, expiry, 1003, orderExpiry);

        await token.approve(conduit.address, toEth(premium * 10), metadata(buyer));

        let signature = await signPoolAskWithEIP712(request, pool.address, lpPrivateKey);
        optionId = await conduit.buyOption.call(request, signature, metadata(buyer));
        await conduit.buyOption(request, signature, metadata(buyer));

        request = makeRequest(id + 1, pool.address, testNft.address, OptionType.CALL, 10, premium, expiry, 1004, orderExpiry);

        await token.approve(conduit.address, toEth(premium * 10), metadata(buyer));

        signature = await signPoolAskWithEIP712(request, pool.address, lpPrivateKey);
        optionId = await conduit.buyOption.call(request, signature, metadata(buyer));
        await conduit.buyOption(request, signature, metadata(buyer));

        request = makeRequest(id + 2, pool.address, testNft.address, OptionType.CALL, 10, premium, expiry, 1001, orderExpiry);

        await token.approve(conduit.address, toEth(premium * 10), metadata(buyer));

        signature = await signPoolAskWithEIP712(request, pool.address, lpPrivateKey);
        optionId = await conduit.buyOption.call(request, signature, metadata(buyer));
        await conduit.buyOption(request, signature, metadata(buyer));

        request = makeRequest(id + 3, pool.address, testNft.address, OptionType.CALL, 10, premium, expiry, 1002, orderExpiry);
        await token.approve(conduit.address, toEth(premium * 10), metadata(buyer));
        signature = await signPoolAskWithEIP712(request, pool.address, lpPrivateKey);
        optionId = await conduit.buyOption.call(request, signature, metadata(buyer));
        await conduit.buyOption(request, signature, metadata(buyer));

        await token.approve(pool.address, toEth(10), metadata(buyer));
        await pool.executeOption(optionId, metadata(buyer));
    });

    it("Clear Expired Options", async () => {
        await advanceTime(10000 * 2);
        await advanceBlock();

        await pool.clearExpiredOptions([2]);

        assert.deepEqual((await pool.getOptionIds()).map(a => a.toNumber()), [1, 3], "Pool doesn't have the correct optionIds");

        await pool.clearExpiredOptions([]);

        assert.deepEqual((await pool.getOptionIds()).map(a => a.toNumber()), [], "Pool doesn't have the correct optionIds");
    });
    
});
