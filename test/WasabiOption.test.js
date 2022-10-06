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
const signRule = async (rule, address) => {
    let encoded = await web3.eth.abi.encodeParameter(
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
    return await web3.eth.sign(encoded, address);
}

contract("WasabiPoolFactory", accounts => {
    let poolFactory;
    let option;
    let testNft;
    const lp = accounts[2];
    const buyer = accounts[3];
    const admin = accounts[4]; // Dkoda

    before("Setup contract for each test", async function () {
        await WasabiStructs.deployed();
        await Signing.deployed();
        testNft = await TestERC721.deployed();
        poolFactory = await WasabiPoolFactory.deployed();
        option = await WasabiOption.deployed();
        await option.setFactory(poolFactory.address);

        await testNft.mint(lp, 1001);
        await testNft.mint(lp, 1002);
        await testNft.mint(lp, 1003);
    })
    
    it("Covered Call Option end-to-end", async () => {
        await testNft.setApprovalForAll.sendTransaction(poolFactory.address, true, {from: lp});

        // 1. Liquidity Provider Creates Pool
        let result = await poolFactory.createPool.sendTransaction(testNft.address, [1001, 1002, 1003], {from: lp});
        truffleAssert.eventEmitted(result, "NewPool", null, "Pool wasn't created");
        truffleAssert.eventEmitted(result, "OwnershipTransferred", { previousOwner: ZERO_ADDRESS, newOwner: lp }, "Pool didn't change owners correctly");

        const poolAddress = result.logs.find(e => e.event === 'NewPool').args.poolAddress;
        const pool = await WasabiPool.at(poolAddress);
        assert.equal(await pool.owner(), lp, "Pool creator and owner not same");
        
        // 2. Write option (only owner)
        let rule = makeRule(0, 1, OptionType.CALL, 1001); // no strike price in rule
        await truffleAssert.reverts(
            pool.writeOption.sendTransaction(rule, await signRule(rule, lp), metadata(buyer, 1)),
            "Strike price must be set",
            "Strike price must be set");
        
        rule = makeRule(10, 0, OptionType.CALL, 1001); // no premium in rule
        await truffleAssert.reverts(
            pool.writeOption.sendTransaction(rule, await signRule(rule, lp), metadata(buyer)),
            "Not enough premium is supplied",
            "Cannot write option when premium is 0");

        rule = makeRule(10, 1, OptionType.CALL, 1001);
        await truffleAssert.reverts(
            pool.writeOption.sendTransaction(rule, await signRule(rule, lp), metadata(buyer, 0.5)), // not sending enough premium
            "Not enough premium is supplied",
            "Premium paid doesn't match the premium of the rule");

        await truffleAssert.reverts(
            pool.writeOption.sendTransaction(rule, await signRule(rule, buyer), metadata(buyer, 1)),
            "Signature Not Valid",
            "Only caller or admin can issue options");

        await truffleAssert.reverts(
            pool.writeOption.sendTransaction(rule, await signRule(makeRule(9, 1, OptionType.CALL, 1001), lp), metadata(buyer, 1)),
            "Signature Not Valid",
            "Signed object and provided object are different");

        result = await pool.writeOption.sendTransaction(rule, await signRule(rule, lp), metadata(buyer, 1));
        truffleAssert.eventEmitted(result, "OptionIssued", {lockedTokenId: toBN(rule.tokenId, 10)}, "Asset wasn't locked");
        const optionId = result.logs.find(e => e.event === 'OptionIssued').args.optionId.toNumber();
        assert.equal(await web3.eth.getBalance(poolAddress), rule.premium, "Incorrect balance in pool");

        await truffleAssert.reverts(
            pool.writeOption.sendTransaction(rule, await signRule(rule, lp), metadata(buyer, 1)),
            "Token is locked or is not in the pool",
            "Cannot (re)write an option for a locked asset");

        // 3. Execute Option (only option holder)
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

        // 4. Withdraw NFTs
        await truffleAssert.reverts(
            pool.withdrawERC721.sendTransaction(testNft.address, [rule.tokenId], {from: lp}),
             "Token is locked or is not in the pool");
        await truffleAssert.reverts(
            pool.withdrawERC721.sendTransaction(testNft.address, [1002], {from: buyer}),
            "caller is not the owner",
            "Only pool owner can withdraw assets");
        await pool.withdrawERC721.sendTransaction(testNft.address, [1002, 1003], {from: lp})
        assert.equal(await testNft.ownerOf(1002), lp, "Pool owner didn't receive withdrawn NFT");
        assert.equal(await testNft.ownerOf(1003), lp, "Pool owner didn't receive withdrawn NFT");

        // 5. Withdraw ETH
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
    
    it("Covered Call Option end-to-end (with admin)", async () => {
        await testNft.setApprovalForAll.sendTransaction(poolFactory.address, true, {from: lp});

        // 1. Liquidity Provider Creates Pool
        let result = await poolFactory.createPool.sendTransaction(testNft.address, [1002, 1003], {from: lp});
        truffleAssert.eventEmitted(result, "NewPool", null, "Pool wasn't created");
        truffleAssert.eventEmitted(result, "OwnershipTransferred", { previousOwner: ZERO_ADDRESS, newOwner: lp }, "Pool didn't change owners correctly");

        const poolAddress = result.logs.find(e => e.event === 'NewPool').args.poolAddress;
        const pool = await WasabiPool.at(poolAddress);
        assert.equal(await pool.owner(), lp, "Pool creator and owner not same");

        // 2. Set admin (only owner can)
        await truffleAssert.reverts(pool.setAdmin.sendTransaction(admin), "caller is not the owner", "Only owner can change the admin.");
        await truffleAssert.reverts(pool.removeAdmin.sendTransaction(), "caller is not the owner", "Only owner can change the admin.");
        result = await pool.setAdmin.sendTransaction(admin, {from: lp});
        truffleAssert.eventEmitted(result, "AdminChanged", {admin: admin}, "Admin wasn't changed");
        
        // 3. Write option (only owner or admin)
        let rule = makeRule(0, 1, OptionType.CALL, 1002); // no strike price in rule
        await truffleAssert.reverts(
            pool.writeOption.sendTransaction(rule, await signRule(rule, admin), metadata(buyer, 1)),
            "Strike price must be set",
            "Strike price must be set");
        
        rule = makeRule(10, 0, OptionType.CALL, 1002); // no premium in rule
        await truffleAssert.reverts(
            pool.writeOption.sendTransaction(rule, await signRule(rule, admin), metadata(buyer)),
            "Not enough premium is supplied",
            "Cannot write option when premium is 0");

        rule = makeRule(10, 1, OptionType.CALL, 1002);
        await truffleAssert.reverts(
            pool.writeOption.sendTransaction(rule, await signRule(rule, admin), metadata(buyer, 0.5)), // not sending enough premium
            "Not enough premium is supplied",
            "Premium paid doesn't match the premium of the rule");

        await truffleAssert.reverts(
            pool.writeOption.sendTransaction(rule, await signRule(rule, buyer), metadata(buyer, 1)),
            "Signature Not Valid",
            "Only caller or admin can issue options");

        await truffleAssert.reverts(
            pool.writeOption.sendTransaction(rule, await signRule(makeRule(9, 1, OptionType.CALL, 1002), admin), metadata(buyer, 1)),
            "Signature Not Valid",
            "Signed object and provided object are different");

        result = await pool.writeOption.sendTransaction(rule, await signRule(rule, admin), metadata(buyer, 1));
        truffleAssert.eventEmitted(result, "OptionIssued", {lockedTokenId: toBN(rule.tokenId, 10)}, "Asset wasn't locked");
        const optionId = result.logs.find(e => e.event === 'OptionIssued').args.optionId.toNumber();
        assert.equal(await web3.eth.getBalance(poolAddress), rule.premium, "Incorrect balance in pool");

        await truffleAssert.reverts(
            pool.writeOption.sendTransaction(rule, await signRule(rule, admin), metadata(buyer, 1)),
            "Token is locked or is not in the pool",
            "Cannot (re)write an option for a locked asset");

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
            pool.withdrawERC721.sendTransaction(testNft.address, [1003], {from: admin}),
            "caller is not the owner",
            "Only pool owner can withdraw assets");

        // 6. Withdraw ETH
        await truffleAssert.reverts(
            pool.withdrawETH.sendTransaction({from: admin}),
            "caller is not the owner",
            "Only pool owner can withdraw ETH");
    });
});
