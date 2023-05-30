const truffleAssert = require('truffle-assertions');

import { makeRequest, metadata, signPoolAskWithEIP712, gasOfTxn, assertIncreaseInBalance, advanceTime, getAllTokenIds } from "./util/TestUtilsV2";

import { PoolAsk, OptionType, ZERO_ADDRESS } from "./util/TestTypesV2";
import { TestERC721Instance } from "../types/truffle-contracts/TestERC721.js";
import { WasabiPoolFactoryV2Instance } from "../types/truffle-contracts/WasabiPoolFactoryV2.js";
import { WasabiOptionInstance } from "../types/truffle-contracts/WasabiOption.js";
import { OptionIssued, ETHWasabiPoolV2Instance } from "../types/truffle-contracts/ETHWasabiPoolV2.js";

const WasabiPoolFactoryV2 = artifacts.require("WasabiPoolFactoryV2");
const WasabiOption = artifacts.require("WasabiOption");
const TestERC721 = artifacts.require("TestERC721");
const ETHWasabiPoolV2 = artifacts.require("ETHWasabiPoolV2");

contract("ETHWasabiPoolV2: Expiring CallOption execution", accounts => {
    let poolFactory: WasabiPoolFactoryV2Instance;
    let option: WasabiOptionInstance;
    let testNft: TestERC721Instance;
    let pool: ETHWasabiPoolV2Instance;
    let optionId: BN;
    let request: PoolAsk;
    let tokenToSell: number;
    let signature;

    const lp = accounts[2];
    const buyer = accounts[3];
    const someoneElse = accounts[5];
    const lpPrivateKey = "0dbbe8e4ae425a6d2687f1a7e3ba17bc98c673636790f1b8ad91193c05875ef1";
    const duration = 10000;

    before("Prepare State", async function () {
        testNft = await TestERC721.deployed();
        option = await WasabiOption.deployed();
        poolFactory = await WasabiPoolFactoryV2.deployed();
        await option.toggleFactory(poolFactory.address, true);

        let mintResult = await testNft.mint(metadata(lp));
        tokenToSell = (mintResult.logs.find(e => e.event == 'Transfer')?.args[2] as BN).toNumber();
    });
    
    it("Create Pool", async () => {

        const createPoolResult = await poolFactory.createPool([testNft.address], lp, metadata(lp));
        truffleAssert.eventEmitted(createPoolResult, "NewPool", null, "Pool wasn't created");
        truffleAssert.eventEmitted(createPoolResult, "OwnershipTransferred", { previousOwner: ZERO_ADDRESS, newOwner: lp }, "Pool didn't change owners correctly");

        const poolAddress = createPoolResult.logs.find(e => e.event == "NewPool")!.args[0];
        await testNft.setApprovalForAll.sendTransaction(poolAddress, true, metadata(lp));

        pool = await ETHWasabiPoolV2.at(poolAddress);
        assert.equal(await pool.owner(), lp, "Pool creator and owner not same");
        assert.deepEqual(await getAllTokenIds(lp, testNft), [tokenToSell], "Pool doesn't have the correct tokens");
    });

    it("Write Option (only owner)", async () => {
        const id = 1;
        let blockNumber = await web3.eth.getBlockNumber();
        let timestamp = Number((await web3.eth.getBlock(blockNumber)).timestamp);
        let expiry = timestamp + duration;
        let orderExpiry = timestamp + duration;

        request = makeRequest(id, pool.address, testNft.address, OptionType.CALL, 10, 1, expiry, tokenToSell, orderExpiry);
        
        signature = await signPoolAskWithEIP712(request, pool.address, lpPrivateKey);
        const writeOptionResult = await pool.writeOption(request, signature, metadata(buyer, 1));
        truffleAssert.eventEmitted(writeOptionResult, "OptionIssued", null, "Asset wasn't locked");
        assert.equal(await web3.eth.getBalance(pool.address), request.premium, "Incorrect balance in pool");

        const log = writeOptionResult.logs.find(l => l.event == "OptionIssued")! as Truffle.TransactionLog<OptionIssued>;
        optionId = log.args.optionId;
        assert.equal(await option.ownerOf(optionId), buyer, "Buyer not the owner of option");
    });

    it("Execute Option (option expires)", async () => {
        await advanceTime(duration * 2);
        await truffleAssert.reverts(
            pool.executeOption(optionId, metadata(buyer, 10)),
            undefined,
            "Expired option cannot be exercised");
    });
});
