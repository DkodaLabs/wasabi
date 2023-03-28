const truffleAssert = require('truffle-assertions');

import { toEth, makeRequest, makeConfig, metadata, signPoolAskWithEIP712, signAskWithEIP712, expectRevertCustomError } from "./util/TestUtils";
import { Ask, PoolAsk, OptionType, ZERO_ADDRESS } from "./util/TestTypes";
import { TestERC721Instance } from "../types/truffle-contracts/TestERC721.js";
import { WasabiPoolFactoryInstance } from "../types/truffle-contracts/WasabiPoolFactory.js";
import { WasabiOptionInstance } from "../types/truffle-contracts/WasabiOption.js";
import { ETHWasabiPoolInstance } from "../types/truffle-contracts/ETHWasabiPool.js";
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
    let request: PoolAsk;
    let conduit: WasabiConduitInstance;

    const admin = accounts[0];
    const lp = accounts[2];
    const buyer = accounts[3];
    const someoneElse = accounts[5];
    const buyerPrivateKey = "c88b703fb08cbea894b6aeff5a544fb92e78a18e19814cd85da83b71f772aa6c";
    const someoneElsePrivateKey = "659cbb0e2411a44db63778987b1e22153c086a95eb6b18bdf89de078917abc63";
    const lpPrivateKey = "0dbbe8e4ae425a6d2687f1a7e3ba17bc98c673636790f1b8ad91193c05875ef1";

    let signature;
    before("Prepare State", async function () {
        conduit = await WasabiConduit.deployed();
        testNft = await TestERC721.deployed();
        await Signing.deployed();
        option = await WasabiOption.deployed();
        poolFactory = await WasabiPoolFactory.deployed();
        await option.setFactory(poolFactory.address);

        await conduit.setPoolFactoryAddress(poolFactory.address);
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
        const id = 1;
        let blockNumber = await web3.eth.getBlockNumber();
        let timestamp = Number((await web3.eth.getBlock(blockNumber)).timestamp);
        let expiry = timestamp + 10000;
        let orderExpiry = timestamp + 10000;
        const premium = 1;
        request = makeRequest(id, pool.address, OptionType.CALL, 10, premium, expiry, 1001, orderExpiry);

        signature = await signPoolAskWithEIP712(request, pool.address, lpPrivateKey);
        optionId = await conduit.buyOption.call(request, signature, metadata(buyer, premium));
        await conduit.buyOption(request, signature, metadata(buyer, premium));

        assert.equal(await web3.eth.getBalance(pool.address), request.premium, "Incorrect balance in pool");

        assert.equal(await option.ownerOf(optionId), buyer, "Buyer not the owner of option");
        const expectedOptionId = await pool.getOptionIdForToken(request.tokenId);
        assert.equal(expectedOptionId.toNumber(), optionId.toNumber(), "Option of token not correct");

        request.id = request.id + 1;
        signature = await signPoolAskWithEIP712(request, pool.address, lpPrivateKey);
        await expectRevertCustomError(
            pool.writeOption.sendTransaction(request, signature, metadata(buyer, 1)),
            "RequestNftIsLocked",
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

        const signature = await signAskWithEIP712(ask, conduit.address, buyerPrivateKey);

        const acceptAskResult = await conduit.acceptAsk(ask, signature, metadata(someoneElse, price));
        truffleAssert.eventEmitted(acceptAskResult, "AskTaken", null, "Ask wasn't taken");
        assert.equal(await option.ownerOf(optionId), someoneElse, "Option not owned after buying");
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

        const signature = await signAskWithEIP712(ask, conduit.address, someoneElsePrivateKey);
        const cancelAskResult = await conduit.cancelAsk(ask, signature, metadata(someoneElse));
        truffleAssert.eventEmitted(cancelAskResult, "AskCancelled", null, "Ask wasn't cancelled");

        await truffleAssert.reverts(
            conduit.acceptAsk(ask, signature, metadata(someoneElse, price)),
            "Order was finalized or cancelled",
            "Can execute cancelled ask"
        );
    });
});
