const truffleAssert = require('truffle-assertions');

import { toEth, toBN, makeRequest, metadata, signPoolAskWithEIP712, gasOfTxn, assertIncreaseInBalance, makeAmmRequest, signAmmRequest, getAllTokenIds } from "./util/TestUtils";
import { PoolAsk, OptionType, ZERO_ADDRESS } from "./util/TestTypes";
import { TestERC721Instance } from "../types/truffle-contracts/TestERC721.js";
import { WasabiPoolFactoryInstance } from "../types/truffle-contracts/WasabiPoolFactory.js";
import { WasabiOptionInstance } from "../types/truffle-contracts/WasabiOption.js";
import { NFTAMMInstance } from "../types/truffle-contracts/NFTAMM.js";
import { ERC20WasabiPoolInstance, OptionIssued, OptionExecuted } from "../types/truffle-contracts/ERC20WasabiPool.js";
import { DemoETHInstance, MockArbitrageInstance } from "../types/truffle-contracts";

const WasabiPoolFactory = artifacts.require("WasabiPoolFactory");
const WasabiOption = artifacts.require("WasabiOption");
const ERC20WasabiPool = artifacts.require("ERC20WasabiPool");
const TestERC721 = artifacts.require("TestERC721");
const DemoETH = artifacts.require("DemoETH");
const NFTAMM = artifacts.require("NFTAMM");
const MockArbitrage = artifacts.require("MockArbitrage");

contract("NFTAMM", accounts => {
    let token: DemoETHInstance;
    let poolFactory: WasabiPoolFactoryInstance;
    let option: WasabiOptionInstance;
    let testNft: TestERC721Instance;
    let poolAddress: string;
    let pool: ERC20WasabiPoolInstance;
    let optionId: BN;
    let request: PoolAsk;
    let nftAmm: NFTAMMInstance;
    let arbitrageTool: MockArbitrageInstance;

    const lp = accounts[2];
    const buyer = accounts[3];
    const someoneElse = accounts[5];
    const duration = 10000;
    const lpPrivateKey = "0dbbe8e4ae425a6d2687f1a7e3ba17bc98c673636790f1b8ad91193c05875ef1";

    const premium = 1;
    const strike = 10;
    const fee = 5;

    before("Prepare State", async function () {
        nftAmm = await NFTAMM.deployed();
        token = await DemoETH.deployed();
        testNft = await TestERC721.deployed();
        option = await WasabiOption.deployed();
        poolFactory = await WasabiPoolFactory.deployed();
        arbitrageTool = await MockArbitrage.deployed();

        await option.toggleFactory(poolFactory.address, true);
        await token.mint(metadata(buyer));
        await token.issue(nftAmm.address, toEth(10000));
        await token.issue(arbitrageTool.address, toEth(100));

        await arbitrageTool.setOption(option.address);
        await arbitrageTool.setFee(fee);

        await testNft.mint(metadata(lp));
        await testNft.mint(metadata(lp));
        await testNft.mint(metadata(lp));
        await testNft.mint(metadata(someoneElse));
        await testNft.mint(metadata(buyer));
        await testNft.mint(metadata(buyer));
        await testNft.transferFrom(buyer, nftAmm.address, 1005, metadata(buyer));
        await testNft.transferFrom(buyer, nftAmm.address, 1006, metadata(buyer));

        await testNft.setApprovalForAll.sendTransaction(poolFactory.address, true, metadata(lp));
        const createPoolResult =
            await poolFactory.createERC20Pool(
                token.address,
                0,
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

    it("Issue Option", async () => {
        await token.approve(pool.address, toEth(premium), metadata(buyer));
        const id = 1;
        let blockNumber = await web3.eth.getBlockNumber();
        let timestamp = Number((await web3.eth.getBlock(blockNumber)).timestamp);
        let expiry = timestamp + duration;
        let orderExpiry = timestamp + duration;
        request = makeRequest(id, pool.address, OptionType.CALL, strike, premium, expiry, 1001, orderExpiry);

        const signature = await signPoolAskWithEIP712(request, pool.address, lpPrivateKey)
        const writeOptionResult = await pool.writeOption(request, signature, metadata(buyer));
        truffleAssert.eventEmitted(writeOptionResult, "OptionIssued", null, "Asset wasn't locked");
        assert.equal(await token.balanceOf(pool.address), request.premium, "Incorrect balance in pool");

        const log = writeOptionResult.logs.find(l => l.event == "OptionIssued")! as Truffle.TransactionLog<OptionIssued>;
        optionId = log.args.optionId;

        assert.equal(await option.ownerOf(optionId), buyer, "Buyer not the owner of option");
        const expectedOptionId = await pool.getOptionIdForToken(request.tokenId);
        assert.equal(expectedOptionId.toNumber(), optionId.toNumber(), "Option of token not correct");
    });

    it("Arbitrage", async () => {
        const deployer = await nftAmm.owner();

        let blockNumber = await web3.eth.getBlockNumber();
        let timestamp = Number((await web3.eth.getBlock(blockNumber)).timestamp);
        let orderExpiry = timestamp + duration;

        await option.setApprovalForAll(arbitrageTool.address, true, metadata(buyer));

        const floor = 13;
        const ammRequest = makeAmmRequest(testNft.address, floor, orderExpiry);
        const arbitrageResult = await arbitrageTool.arbitrage(
            optionId,
            poolAddress,
            ammRequest,
            await signAmmRequest(ammRequest, deployer),
            metadata(buyer));

        const payout = toBN(toEth((100 - fee) * (floor - strike) / 100));
        await truffleAssert.eventEmitted(
            arbitrageResult,
            "Arbitrage",
            { account: buyer, optionId, payout },
            "No arbitrage");
        const balanceAfter = await token.balanceOf(buyer);

        const increase = payout.sub(toBN(toEth(premium)));
        const initialBalance = toBN(toEth(100)); // Initial mint is 100
        assert.equal(balanceAfter.sub(initialBalance).toString(), increase.toString(), "Not enough");
        await truffleAssert.reverts(option.ownerOf(optionId), "ERC721: invalid token ID", "Token not burned");
    });
});