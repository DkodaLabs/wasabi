const truffleAssert = require('truffle-assertions');
const BigNumber = require("bignumber.js");

const WasabiStructs = artifacts.require("./lib/WasabiStructs.sol");
const {OptionType} = WasabiStructs;
const Signing = artifacts.require("./lib/Signing.sol");
const WasabiPoolFactory = artifacts.require("./WasabiPoolFactory.sol");
const WasabiOption = artifacts.require("./WasabiOption.sol");
const WasabiPool = artifacts.require("./WasabiPool.sol");
const TestERC721 = artifacts.require("./mocks/TestERC721.sol");

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const toEth = (value) => {
    return web3.utils.toWei(`${value}`, "ether");
}
const toBN = (value) => {
    return web3.utils.toBN(value, 10);
}

const makeRule = (strikePrice, premium, optionType, tokenId) => {
    return { strikePrice: toEth(strikePrice), premium: toEth(premium), optionType, tokenId };
}
const metadata = (from = undefined, value = undefined) => {
    const m = {};
    if (from) {
        m.from = from;
    }
    if (value) {
        m.value = toEth(value);
    }
    return m;
}
const gasOfTxn = (result) => {
    const gasUsed = new BigNumber(result.receipt.gasUsed);
    const gasPrice = new BigNumber(result.receipt.effectiveGasPrice);
    return gasPrice.multipliedBy(gasUsed);
}

contract("WasabiPoolFactory", accounts => {
    let poolFactory;
    let option;
    let testNft;

    beforeEach("Setup contract for each test", async function () {
        await WasabiStructs.deployed();
        await Signing.deployed();
        testNft = await TestERC721.deployed();
        poolFactory = await WasabiPoolFactory.deployed();
        option = await WasabiOption.deployed();
        await option.setFactory(poolFactory.address);
    })
    
    it("Covered Call Option end-to-end", async () => {
        // console.log("Test NFT address", testNft.address);
        // console.log("Wasabi Option NFT address", option.address);

        const lp = accounts[2];
        const buyer = accounts[3];
        const admin = accounts[4];

        await testNft.mint(lp, 1001);
        await testNft.mint(lp, 1002);
        await testNft.mint(lp, 1003);
        await testNft.setApprovalForAll.sendTransaction(poolFactory.address, true, {from: lp});

        // 1. Liquidity Provider Creates Pool
        result = await poolFactory.createPool.sendTransaction(testNft.address, [1001, 1002, 1003], {from: lp});
        truffleAssert.eventEmitted(result, "NewPool", null, "Pool wasn't created");
        truffleAssert.eventEmitted(result, "OwnershipTransferred", { previousOwner: ZERO_ADDRESS, newOwner: lp }, "Pool didn't change owners correctly");

        const poolAddress = result.logs.find(e => e.event === 'NewPool').args[0];
        const pool = await WasabiPool.at(poolAddress);
        assert.equal(await pool.owner(), lp, "Pool creator and owner not same");

        // 2. Set admin (only owner can)
        await truffleAssert.reverts(pool.setAdmin.sendTransaction(admin), "caller is not the owner", "Only owner can change the admin.");
        await truffleAssert.reverts(pool.removeAdmin.sendTransaction(), "caller is not the owner", "Only owner can change the admin.");
        result = await pool.setAdmin.sendTransaction(admin, {from: lp});
        truffleAssert.eventEmitted(result, "AdminChanged", {admin: admin}, "Admin wasn't changed");
        
        // 3. Write option (only owner or admin)
        const rule = makeRule(10, 1, OptionType.CALL, 1001);
        encoded = await web3.eth.abi.encodeParameter(
            {
                "OptionRule": {
                    "strikePrice": 'uint256',
                    "premium": 'uint256',
                    "optionType": 'uint256',
                    "tokenId": 'uint256',
                }
            },
            rule);
        encoded = await web3.utils.keccak256(encoded);
        console.log("Encoded by test", encoded);
        console.log("Encoded by pool", await pool.hashOrder.call(rule));
        const signedMessage = await web3.eth.sign(encoded, lp);
        // Encoded by test 0xb633353483265f6c96bfca911f87c3aac6f72cac6c671de90f7ed0e68b30106f
        // Encoded by pool 0x043f498b482cd95074d6b3e4079d7e07942d06aa92e186d920ab21d8227e47b6
        // await truffleAssert.reverts(
        //     pool.writeOption.sendTransaction(makeRule(0, 1, OptionType.CALL, 1001), buyer, metadata(admin, 1)),
        //     "Strike price must be set",
        //     "Strike price must be set");
        // await truffleAssert.reverts(
        //     pool.writeOption.sendTransaction(makeRule(10, 0, OptionType.CALL, 1001), buyer, metadata(admin)),
        //     "Not enough premium is supplied",
        //     "Cannot write option when premium is 0");
        // await truffleAssert.reverts(
        //     pool.writeOption.sendTransaction(makeRule(10, 1, OptionType.CALL, 1001), buyer, metadata(admin, 0.5)),
        //     "Not enough premium is supplied",
        //     "Premium paid doesn't match the premium of the rule");
        // await truffleAssert.reverts(
        //     pool.writeOption.sendTransaction(rule, buyer, metadata(null, 1)),
        //     "caller is not the owner or admin",
        //     "Only caller or admin can issue options");
        result = await pool.writeOption.sendTransaction(rule, buyer, signedMessage, metadata(admin, 1)); // Correctly writes it
        truffleAssert.eventEmitted(result, "NFTLocked", {tokenId: toBN(rule.tokenId, 10)}, "Asset wasn't locked");
        // await truffleAssert.reverts(
        //     pool.writeOption.sendTransaction(rule, buyer, metadata(admin, 1)),
        //     "Token is locked or is not in the pool",
        //     "Cannot write an option for a locked asset");
        const optionId = (await option.tokenOfOwnerByIndex.call(buyer, 0)).toNumber();
        assert.equal(await web3.eth.getBalance(poolAddress), rule.premium, "Incorrect balance in pool");
        return;

        // 4. Execute Option (only option holder)
        await truffleAssert.reverts(
            pool.executeOption.sendTransaction(optionId, metadata(null, 10)),
            "Only the token owner can execute the option",
            "Non option holder can't execute the option");
        await truffleAssert.reverts(
            pool.executeOption.sendTransaction(optionId, metadata(buyer, 5)),
            "Strike price needs to be supplied to execute a CALL option",
            "Strike price needs to be supplied to execute a CALL option");
        result = await pool.executeOption.sendTransaction(optionId, metadata(buyer, 10));
        truffleAssert.eventEmitted(result, "OptionExecuted", {optionId: toBN(optionId, 10)}, "Option wasn't executed");
        assert.equal(await testNft.ownerOf(rule.tokenId), buyer, "Option executor didn't get NFT");
        assert.equal(await web3.eth.getBalance(poolAddress), toEth(10 + 1), "Incorrect balance in pool");

        // 5. Withdraw NFTs
        await truffleAssert.reverts(
            pool.withdrawERC721.sendTransaction(testNft.address, [rule.tokenId], {from: lp}),
             "Token is locked or is not in the pool");
        await truffleAssert.reverts(
            pool.withdrawERC721.sendTransaction(testNft.address, [1002], {from: buyer}),
            "caller is not the owner",
            "Only pool owner can withdraw assets");
        await pool.withdrawERC721.sendTransaction(testNft.address, [1002], {from: lp})
        assert.equal(await testNft.ownerOf(1002), lp, "Pool owner didn't receive withdrawn NFT");

        // 6. Withdraw ETH
        await truffleAssert.reverts(
            pool.withdrawETH.sendTransaction({from: buyer}),
            "caller is not the owner",
            "Only pool owner can withdraw ETH");
        const initialBalance = new BigNumber(await web3.eth.getBalance(lp));
        result = await pool.withdrawETH.sendTransaction({from: lp});
        const newBalance = new BigNumber(await web3.eth.getBalance(lp));
        const expectedBalance = initialBalance.plus(new BigNumber(toEth(11))).minus(gasOfTxn(result));
        assert.equal(await web3.eth.getBalance(poolAddress), 0, "Incorrect balance in pool");
        assert.equal(newBalance.toString(), expectedBalance.toString(), "Incorrect balance in address");
    });
});
