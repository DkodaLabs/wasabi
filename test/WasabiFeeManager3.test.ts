import { TestWasabiPassInstance, WasabiFeeManager3Instance } from "../types/truffle-contracts";
import { metadata, revert, takeSnapshot, toEth } from "./util/TestUtils";

const WasabiFeeManager3 = artifacts.require("WasabiFeeManager3");
const TestWasabiPass = artifacts.require("TestWasabiPass");

contract("WasabiFeeManager3", accounts => {
    let wasabiPass: TestWasabiPassInstance;
    let feeManager: WasabiFeeManager3Instance;

    const deployer = accounts[0];
    const user = accounts[1];
    const rawFee = 200;
    const baseDenominator = 10_000;
    const feeReduction = 15;
    const maxAmount = 10;

    before("Prepare State", async function () {
        wasabiPass = await TestWasabiPass.deployed();
        feeManager = await WasabiFeeManager3.deployed();
    })

    it("0 passes", async () => {
        const wholeSnapshotId = await takeSnapshot();

        const rawAmount = 1;

        const feeData = await feeManager.getFeeDataForOption(1, toEth(rawAmount), metadata(user));

        assert.equal(feeData[1].toString(), toEth(rawAmount * rawFee / baseDenominator), "0 passes no discount");
        
        await revert(wholeSnapshotId);
    });

    it("1 pass", async () => {
        const wholeSnapshotId = await takeSnapshot();

        const numPasses = 1;
        await wasabiPass.mint(numPasses, metadata(user));

        const rawAmount = 1;
        const feeData = await feeManager.getFeeDataForOption(1, toEth(rawAmount), metadata(user));

        const expectedFee = rawAmount * (rawFee - numPasses * feeReduction) / baseDenominator;
        assert.equal(feeData[1].toString(), toEth(expectedFee), "1 pass single discount");
        
        await revert(wholeSnapshotId);
    });

    it("9 passes", async () => {
        const wholeSnapshotId = await takeSnapshot();

        const numPasses = 9;
        await wasabiPass.mint(numPasses, metadata(user));

        const rawAmount = 1;
        const feeData = await feeManager.getFeeDataForOption(1, toEth(rawAmount), metadata(user));

        const expectedFee = rawAmount * (rawFee - numPasses * feeReduction) / baseDenominator;
        assert.equal(feeData[1].toString(), toEth(expectedFee), "9 passes 9x discount");
        
        await revert(wholeSnapshotId);
    });

    it("11 passes", async () => {
        const wholeSnapshotId = await takeSnapshot();

        const numPasses = 11;
        await wasabiPass.mint(numPasses, metadata(user));

        const rawAmount = 1;
        const feeData = await feeManager.getFeeDataForOption(1, toEth(rawAmount), metadata(user));

        const expectedFee = rawAmount * (rawFee - maxAmount * feeReduction) / baseDenominator;
        assert.equal(feeData[1].toString(), toEth(expectedFee), "11 passes max discount");
        
        await revert(wholeSnapshotId);
    });

    it("9 passes (fee discount disabled)", async () => {
        const wholeSnapshotId = await takeSnapshot();

        await feeManager.togglePassDiscount(false, metadata(deployer));

        const numPasses = 9;
        await wasabiPass.mint(numPasses, metadata(user));

        const rawAmount = 1;
        const feeData = await feeManager.getFeeDataForOption(1, toEth(rawAmount), metadata(user));

        const expectedFee = rawAmount * rawFee / baseDenominator;
        assert.equal(feeData[1].toString(), toEth(expectedFee), "9 passes 9x discount");
        
        await revert(wholeSnapshotId);
    });
});