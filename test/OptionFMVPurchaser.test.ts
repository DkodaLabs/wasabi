const truffleAssert = require('truffle-assertions');

import { toEth, toBN, makeRequest, makeConfig, metadata, signPoolAskWithEIP712, signRequest,gasOfTxn, assertIncreaseInBalance, advanceTime, getAllTokenIds } from "./util/TestUtils";
import { PoolAsk, OptionType, ZERO_ADDRESS } from "./util/TestTypes";
import { TestERC721Instance } from "../types/truffle-contracts/TestERC721.js";
import { WasabiPoolFactoryInstance } from "../types/truffle-contracts/WasabiPoolFactory.js";
import { WasabiOptionInstance } from "../types/truffle-contracts/WasabiOption.js";
import { OptionFMVPurchaserInstance } from "../types/truffle-contracts/OptionFMVPurchaser.js";
import { ERC20WasabiPoolInstance, OptionIssued, OptionExecuted } from "../types/truffle-contracts/ERC20WasabiPool.js";
import { DemoETHInstance } from "../types/truffle-contracts";

const Signing = artifacts.require("Signing");
const WasabiPoolFactory = artifacts.require("WasabiPoolFactory");
const WasabiOption = artifacts.require("WasabiOption");
const ERC20WasabiPool = artifacts.require("ERC20WasabiPool");
const TestERC721 = artifacts.require("TestERC721");
const DemoETH = artifacts.require("DemoETH");
const OptionFMVPurchaser = artifacts.require("OptionFMVPurchaser");

contract("OptionFMVPurchaser", accounts => {
    let token: DemoETHInstance;
    let poolFactory: WasabiPoolFactoryInstance;
    let option: WasabiOptionInstance;
    let testNft: TestERC721Instance;
    let poolAddress: string;
    let pool: ERC20WasabiPoolInstance;
    let optionId: BN;
    let request: PoolAsk;
    let optionFMVPurchaser: OptionFMVPurchaserInstance;

    const lp = accounts[2];
    const buyer = accounts[3];
    const someoneElse = accounts[5];
    const duration = 10000;
    const lpPrivateKey = "0dbbe8e4ae425a6d2687f1a7e3ba17bc98c673636790f1b8ad91193c05875ef1";


    before("Prepare State", async function () {
        optionFMVPurchaser = await OptionFMVPurchaser.deployed();
        token = await DemoETH.deployed();
        testNft = await TestERC721.deployed();
        await Signing.deployed();
        option = await WasabiOption.deployed();
        poolFactory = await WasabiPoolFactory.deployed();
        await option.toggleFactory(poolFactory.address, true);
        
        await token.mint(metadata(buyer));
        await token.issue(optionFMVPurchaser.address, toEth(10000));
        await optionFMVPurchaser.setOption(option.address);

        await testNft.mint(metadata(lp));
        await testNft.mint(metadata(lp));
        await testNft.mint(metadata(lp));
        await testNft.mint(metadata(someoneElse));
        await testNft.mint(metadata(buyer));
        await testNft.mint(metadata(buyer));

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
        assert.deepEqual(await getAllTokenIds(pool.address, testNft), [1001, 1002, 1003], "Pool doesn't have the correct tokens");
        assert.equal(await pool.getLiquidityAddress(), token.address, 'Token not correct');

        const premium = 1;
        await token.approve(pool.address, toEth(premium * 10), metadata(buyer));
        const id = 1;
        let blockNumber = await web3.eth.getBlockNumber();
        let timestamp = Number((await web3.eth.getBlock(blockNumber)).timestamp);
        let expiry = timestamp + duration;
        let orderExpiry = timestamp + duration;
        request = makeRequest(id, pool.address, OptionType.CALL, 10, premium, expiry, 1001, orderExpiry);
    });

    it("Issue Option", async () => {
        const signature = await signPoolAskWithEIP712(request, pool.address, lpPrivateKey);
        const writeOptionResult = await pool.writeOption(request, signature, metadata(buyer));
        truffleAssert.eventEmitted(writeOptionResult, "OptionIssued", null, "Asset wasn't locked");
        assert.equal(await token.balanceOf(pool.address), request.premium, "Incorrect balance in pool");

        const log = writeOptionResult.logs.find(l => l.event == "OptionIssued")! as Truffle.TransactionLog<OptionIssued>;
        optionId = log.args.optionId;

        assert.equal(await option.ownerOf(optionId), buyer, "Buyer not the owner of option");
        const expectedOptionId = await pool.getOptionIdForToken(request.tokenId);
        assert.equal(expectedOptionId.toNumber(), optionId.toNumber(), "Option of token not correct");
    });

    it("Buyback", async () => {
        const deployer = await optionFMVPurchaser.owner();
        const optionData = await pool.getOptionData(optionId);

        const id = 1;
        let blockNumber = await web3.eth.getBlockNumber();
        let timestamp = Number((await web3.eth.getBlock(blockNumber)).timestamp);
        let orderExpiry = timestamp + duration;

        request = makeRequest(id, poolAddress, OptionType.CALL, 10, 2, Number(optionData.expiry), 1001, orderExpiry);

        await option.setApprovalForAll(optionFMVPurchaser.address, true, metadata(buyer));

        const balanceBefore = toBN(toEth(100)); // Initial mint is 100
        await optionFMVPurchaser.buyOption(
            optionId,
            poolAddress,
            request,
            await signRequest(request, deployer),
            metadata(buyer));
        const balanceAfter = await token.balanceOf(buyer);

        assert.equal(balanceAfter.sub(balanceBefore).toString(), toEth(1), "Not enough");
        await truffleAssert.reverts(option.ownerOf(optionId), "ERC721: invalid token ID", "Token not burned");
    });
});