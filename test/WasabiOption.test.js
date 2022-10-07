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

const makeRule = (strikePrice, premium, optionType, tokenId = 0) => {
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

const assertIncreaseInBalance = async (address, initialBalance, increase) => {
    const newBalance = new BigNumber(await web3.eth.getBalance(address));
    const expectedBalance = initialBalance.plus(increase);
    assert.equal(newBalance.toString(), expectedBalance.toString(), "Incorrect balance in address");
}

contract("Wasabi Options end-to-end", accounts => {
    let poolFactory;
    let option;
    let testNft;
    const lp = accounts[2];
    const buyer = accounts[3];
    const admin = accounts[4]; // Dkoda
    const someoneElse = accounts[5]; // Dkoda

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
        await testNft.mint(someoneElse, 1004);
        await testNft.mint(buyer, 1005);
        await testNft.mint(buyer, 1006);
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
        truffleAssert.eventEmitted(result, "OptionIssued", {lockedTokenId: toBN(rule.tokenId)}, "Asset wasn't locked");
        assert.equal(await web3.eth.getBalance(poolAddress), rule.premium, "Incorrect balance in pool");

        const optionId = result.logs.find(e => e.event === 'OptionIssued').args.optionId.toNumber();
        assert.equal(await option.ownerOf(optionId), buyer, "Buyer not the owner of option");

        await truffleAssert.reverts(
            pool.writeOption.sendTransaction(rule, await signRule(rule, lp), metadata(buyer, 1)),
            "Token is locked or is not in the pool",
            "Cannot (re)write an option for a locked asset");

        // 3. Execute Option (only option holder)
        await truffleAssert.reverts(
            pool.executeOption.sendTransaction(optionId, metadata(someoneElse, 10)),
            "Only the token owner can execute the option",
            "Non option holder can't execute the option");
        await truffleAssert.reverts(
            pool.executeOption.sendTransaction(optionId, metadata(buyer, 5)),
            "Strike price needs to be supplied to execute a CALL option",
            "Strike price needs to be supplied to execute a CALL option");
        result = await pool.executeOption.sendTransaction(optionId, metadata(buyer, 10));
        truffleAssert.eventEmitted(result, "OptionExecuted", {optionId: toBN(optionId)}, "Option wasn't executed");
        assert.equal(await testNft.ownerOf(rule.tokenId), buyer, "Option executor didn't get NFT");
        assert.equal(await web3.eth.getBalance(poolAddress), toEth(10 + 1), "Incorrect balance in pool");
        await truffleAssert.reverts(option.ownerOf(optionId), "ERC721: invalid token ID", "Option NFT not burned after execution");

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
        assertIncreaseInBalance(lp, initialBalance, new BigNumber(toEth(11)).minus(gasOfTxn(result)));
        assert.equal(await web3.eth.getBalance(poolAddress), 0, "Incorrect balance in pool");
    });
    
    it("Covered Call Option end-to-end (with admin)", async () => {
        await testNft.setApprovalForAll.sendTransaction(poolFactory.address, true, metadata(lp));

        // 1. Liquidity Provider Creates Pool
        let result = await poolFactory.createPool.sendTransaction(testNft.address, [1002, 1003], metadata(lp));
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
        truffleAssert.eventEmitted(result, "OptionIssued", {lockedTokenId: toBN(rule.tokenId)}, "Asset wasn't locked");
        assert.equal(await web3.eth.getBalance(poolAddress), rule.premium, "Incorrect balance in pool");

        const optionId = result.logs.find(e => e.event === 'OptionIssued').args.optionId.toNumber();
        assert.equal(await option.ownerOf(optionId), buyer, "Buyer not the owner of option");

        await truffleAssert.reverts(
            pool.writeOption.sendTransaction(rule, await signRule(rule, admin), metadata(buyer, 1)),
            "Token is locked or is not in the pool",
            "Cannot (re)write an option for a locked asset");

        // 4. Execute Option (only option holder)
        await truffleAssert.reverts(
            pool.executeOption.sendTransaction(optionId, metadata(someoneElse, 10)),
            "Only the token owner can execute the option",
            "Non option holder can't execute the option");
        await truffleAssert.reverts(
            pool.executeOption.sendTransaction(optionId, metadata(buyer, 5)),
            "Strike price needs to be supplied to execute a CALL option",
            "Strike price needs to be supplied to execute a CALL option");
        result = await pool.executeOption.sendTransaction(optionId, metadata(buyer, 10));
        truffleAssert.eventEmitted(result, "OptionExecuted", {optionId: toBN(optionId)}, "Option wasn't executed");
        assert.equal(await testNft.ownerOf(rule.tokenId), buyer, "Option executor didn't get NFT");
        assert.equal(await web3.eth.getBalance(poolAddress), toEth(10 + 1), "Incorrect balance in pool");
        await truffleAssert.reverts(option.ownerOf(optionId), "ERC721: invalid token ID", "Option NFT not burned after execution");

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

    it("Covered Put Option end-to-end", async () => {
        const initialPoolBalance = 20;
        const strikePrice = 10;
        const premium = 1;

        // 1. Liquidity Provider Creates Pool
        let result = await poolFactory.createPool.sendTransaction(testNft.address, [], metadata(lp, initialPoolBalance));
        truffleAssert.eventEmitted(result, "NewPool", null, "Pool wasn't created");
        truffleAssert.eventEmitted(result, "OwnershipTransferred", { previousOwner: ZERO_ADDRESS, newOwner: lp }, "Pool didn't change owners correctly");
        const poolAddress = result.logs.find(e => e.event === 'NewPool').args.poolAddress;
        const pool = await WasabiPool.at(poolAddress);
        assert.equal(await pool.owner(), lp, "Pool creator and owner not same");
        assert.equal(await web3.eth.getBalance(poolAddress), toEth(initialPoolBalance), "Incorrect total balance in pool");
        assert.equal(await pool.availableBalance.call(), toEth(initialPoolBalance), "Incorrect available balance in pool");

        // 2. Write option (only owner)
        let rule = makeRule(0, premium, OptionType.PUT); // no strike price in rule
        await truffleAssert.reverts(
            pool.writeOption.sendTransaction(rule, await signRule(rule, lp), metadata(buyer, premium)),
            "Strike price must be set",
            "Strike price must be set");
        
        rule = makeRule(strikePrice, 0, OptionType.PUT); // no premium in rule
        await truffleAssert.reverts(
            pool.writeOption.sendTransaction(rule, await signRule(rule, lp), metadata(buyer)),
            "Not enough premium is supplied",
            "Cannot write option when premium is 0");

        rule = makeRule(initialPoolBalance * 5, premium, OptionType.PUT); // strike price too high
        await truffleAssert.reverts(
            pool.writeOption.sendTransaction(rule, await signRule(rule, lp), metadata(buyer, premium)),
            "Not enough ETH available to lock",
            "Cannot write option strike price is higher than available balance");

        rule = makeRule(strikePrice, premium, OptionType.PUT);
        await truffleAssert.reverts(
            pool.writeOption.sendTransaction(rule, await signRule(rule, lp), metadata(buyer, premium / 2)), // not sending enough premium
            "Not enough premium is supplied",
            "Premium paid doesn't match the premium of the rule");

        await truffleAssert.reverts(
            pool.writeOption.sendTransaction(rule, await signRule(rule, buyer), metadata(buyer, premium)),
            "Signature Not Valid",
            "Only caller or admin can issue options");

        const rule2 = makeRule(strikePrice - 1, premium, OptionType.PUT);
        await truffleAssert.reverts(
            pool.writeOption.sendTransaction(rule, await signRule(rule2, lp), metadata(buyer, premium)),
            "Signature Not Valid",
            "Signed object and provided object are different");

        result = await pool.writeOption.sendTransaction(rule, await signRule(rule, lp), metadata(buyer, premium));
        truffleAssert.eventEmitted(result, "OptionIssued", {lockedTokenId: toBN(rule.strikePrice)}, "Strike price wasn't locked")
        assert.equal(await web3.eth.getBalance(poolAddress), toEth(initialPoolBalance + premium), "Incorrect total balance in pool");
        assert.equal(await pool.availableBalance.call(), toEth(initialPoolBalance - strikePrice + premium), "Incorrect available balance in pool");

        const optionId = result.logs.find(e => e.event === 'OptionIssued').args.optionId.toNumber();
        assert.equal(await option.ownerOf(optionId), buyer, "Buyer not the owner of option");

        // 4. Execute Option (only option holder)
        const tokenToSell = 1005;
        assert.equal(await testNft.ownerOf(tokenToSell), buyer, "MP is not the owner of token to sell");
        await testNft.approve(poolAddress, tokenToSell, metadata(buyer));

        await truffleAssert.reverts(
            pool.executeOptionWithSell.sendTransaction(optionId, tokenToSell, metadata(someoneElse)),
            "Only the token owner can execute the option",
            "Non option holder can't execute the option");
        await truffleAssert.reverts(
            pool.executeOptionWithSell.sendTransaction(optionId, 1004, metadata(buyer)),
            "Need to own the token to sell in order to execute a PUT option",
            "Cannot execute PUT and sell someone else's asset");

        let initialBalance = new BigNumber(await web3.eth.getBalance(buyer));
        result = await pool.executeOptionWithSell.sendTransaction(optionId, tokenToSell, metadata(buyer));
        assertIncreaseInBalance(buyer, initialBalance, new BigNumber(toEth(strikePrice)).minus(gasOfTxn(result)));
        truffleAssert.eventEmitted(result, "OptionExecuted", {optionId: toBN(optionId)}, "Option wasn't executed");
        assert.equal(await web3.eth.getBalance(poolAddress), toEth(initialPoolBalance - strikePrice + premium), "Incorrect total balance in pool");
        assert.equal(await pool.availableBalance.call(), toEth(initialPoolBalance - strikePrice + premium), "Incorrect available balance in pool");
        assert.equal(await testNft.ownerOf(tokenToSell), poolAddress, "Pool didn't get NFT");
        await truffleAssert.reverts(option.ownerOf(optionId), "ERC721: invalid token ID", "Option NFT not burned after execution");

        // 5. Withdraw ETH
        await truffleAssert.reverts(
            pool.withdrawETH.sendTransaction({from: buyer}),
            "caller is not the owner",
            "Only pool owner can withdraw ETH");
        initialBalance = new BigNumber(await web3.eth.getBalance(lp));
        const availableBalance = await pool.availableBalance.call();
        result = await pool.withdrawETH.sendTransaction({from: lp});
        assertIncreaseInBalance(lp, initialBalance, new BigNumber(availableBalance).minus(gasOfTxn(result)));
        assert.equal(await web3.eth.getBalance(poolAddress), 0, "Incorrect balance in pool");

        await truffleAssert.reverts(
            pool.withdrawETH.sendTransaction({from: lp}),
            "No ETH available to withdraw",
            "Cannot withdraw ETH if there is none");
    });
});
