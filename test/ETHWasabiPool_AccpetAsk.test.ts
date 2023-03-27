const truffleAssert = require('truffle-assertions');

import { WasabiPoolFactoryInstance, WasabiOptionInstance, TestERC721Instance, ETHWasabiPoolInstance, WasabiConduitInstance} from "../types/truffle-contracts";
import { OptionIssued } from "../types/truffle-contracts/IWasabiPool";
import { PoolAsk, OptionType, ZERO_ADDRESS, Ask } from "./util/TestTypes";
import { advanceTime, assertIncreaseInBalance, gasOfTxn, makeConfig, makeRequest, metadata, signRequest, toBN, toEth, signAskWithEIP712 } from "./util/TestUtils";

const Signing = artifacts.require("Signing");
const WasabiPoolFactory = artifacts.require("WasabiPoolFactory");
const WasabiConduitFactory = artifacts.require("WasabiConduit");
const WasabiOption = artifacts.require("WasabiOption");
const ETHWasabiPool = artifacts.require("ETHWasabiPool");
const TestERC721 = artifacts.require("TestERC721");

contract("ETHWasabiPool: AcceptAsk", accounts => {
    let poolFactory: WasabiPoolFactoryInstance;
    let conduit: WasabiConduitInstance;
    let option: WasabiOptionInstance;
    let testNft: TestERC721Instance;
    let pool: ETHWasabiPoolInstance;
    let optionId: BN | string;
    let request: PoolAsk;
    let afterRoyaltyPayoutPercent: number;

    const lp = accounts[2];
    const buyer = accounts[3];
    const someoneElse = accounts[5];

    const initialPoolBalance = 10;
    const strikePrice = 10;
    const premium = 1;
    const duration = 86400;
    const buyerPrivateKey = "c88b703fb08cbea894b6aeff5a544fb92e78a18e19814cd85da83b71f772aa6c";
    const lpPrivateKey = "0dbbe8e4ae425a6d2687f1a7e3ba17bc98c673636790f1b8ad91193c05875ef1";

    before("Prepare State", async function () {
        testNft = await TestERC721.deployed();
        await Signing.deployed();
        option = await WasabiOption.deployed();
        poolFactory = await WasabiPoolFactory.deployed();
        conduit = await WasabiConduitFactory.deployed();
        await option.setFactory(poolFactory.address);
        await conduit.setOption(option.address);
        await conduit.setPoolFactoryAddress(poolFactory.address);
        poolFactory.setConduitAddress(conduit.address);

        let mintResult = await testNft.mint(metadata(buyer));
        mintResult = await testNft.mint(metadata(someoneElse));

        afterRoyaltyPayoutPercent = 1;
    });

    it("Create Pool", async() => {
        const createPoolResult =
            await poolFactory.createPool(
                testNft.address,
                [],
                makeConfig(1, 100, 222, 2630000 /* one month */),
                [OptionType.PUT],
                ZERO_ADDRESS,
                metadata(lp, initialPoolBalance));

        truffleAssert.eventEmitted(createPoolResult, "NewPool", null, "Pool wasn't created");
        truffleAssert.eventEmitted(createPoolResult, "OwnershipTransferred", { previousOwner: ZERO_ADDRESS, newOwner: lp }, "Pool didn't change owners correctly");

        const poolAddress = createPoolResult.logs.find(e => e.event === 'NewPool')!.args[0];
        pool = await ETHWasabiPool.at(poolAddress);

        assert.equal(await pool.owner(), lp, "Pool creator and owner not same");
        assert.equal(await web3.eth.getBalance(pool.address), toEth(initialPoolBalance), "Incorrect total balance in pool");
        assert.equal((await pool.availableBalance()).toString(), toEth(initialPoolBalance), "Incorrect available balance in pool");
    });

    it("Write Option (only owner)", async () => {
        const id = 1;
        let blockNumber = await web3.eth.getBlockNumber();
        let timestamp = Number((await web3.eth.getBlock(blockNumber)).timestamp);
        let expiry = timestamp + duration;
        let orderExpiry = timestamp + duration;
        request = makeRequest(id, pool.address, OptionType.PUT, strikePrice, premium, expiry, 0, orderExpiry);
        const writeOptionResult = await pool.writeOption(request, await signRequest(request, lp), metadata(lp, 1));
        truffleAssert.eventEmitted(writeOptionResult, "OptionIssued", null, "Asset wasn't locked");
        await assertIncreaseInBalance(pool.address, toBN(toEth(initialPoolBalance)), toBN(request.premium));

        const log = writeOptionResult.logs.find(l => l.event == "OptionIssued")! as Truffle.TransactionLog<OptionIssued>;
        optionId = log.args.optionId;
        assert.equal(await option.ownerOf(optionId), lp, "Buyer not the owner of option");
    });

    it("Accept ask - should revert if not an owner", async () => {
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

        const signature = await signAskWithEIP712(ask, conduit.address, lpPrivateKey);

        await truffleAssert.reverts(pool.acceptAsk(ask, signature, metadata(buyer)), "Ownable: caller is not the owner");
    });

    it("Accept ask - should revert if pool balance is not enough", async () => {
        const price = 15;
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

        const signature = await signAskWithEIP712(ask, conduit.address, lpPrivateKey);

        await truffleAssert.reverts(pool.acceptAsk(ask, signature, metadata(lp)), "WasabiPool: Not enough available balance to pay");
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

        const signature = await signAskWithEIP712(ask, conduit.address, lpPrivateKey);

        const initialBalanceSeller = await web3.eth.getBalance(optionOwner);
        const acceptAskResult = await pool.acceptAsk(ask, signature, metadata(lp));
        const finalBalanceSeller = await web3.eth.getBalance(optionOwner);
        const resultsOfConduit= await truffleAssert.createTransactionResult(conduit, acceptAskResult.tx)

        await truffleAssert.eventEmitted(resultsOfConduit, "AskTaken", null, "Ask wasn't taken");
        await assertIncreaseInBalance(lp, toBN(initialBalanceSeller), toBN(Number(ask.price) * afterRoyaltyPayoutPercent).sub(gasOfTxn(acceptAskResult.receipt)));
    });
});