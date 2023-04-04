// A script to fille the NFT AMM instead of calling everything one by one
//
// > truffle exec scripts/NFTAMMFiller.ts --network=goerli

const TestAzuki = artifacts.require("TestAzuki");
const TestBitBears = artifacts.require("TestBitBears");
const TestBoredApes = artifacts.require("TestBoredApes");
const TestCaptainz = artifacts.require("TestCaptainz");
const TestChecks = artifacts.require("TestChecks");
const TestCloneX = artifacts.require("TestCloneX");
const TestCryptoDickButts = artifacts.require("TestCryptoDickButts");
const TestDoodles = artifacts.require("TestDoodles");
const TestFriendshipBracelets = artifacts.require("TestFriendshipBracelets");
const TestInvisibleFriends = artifacts.require("TestInvisibleFriends");
const TestMfers = artifacts.require("TestMfers");
const TestMilady = artifacts.require("TestMilady");
const TestMoonbirds = artifacts.require("TestMoonbirds");
const TestMutantApes = artifacts.require("TestMutantApes");
const TestMutantHoundCollars = artifacts.require("TestMutantHoundCollars");
const TestNakamigos = artifacts.require("TestNakamigos");
const TestPudgyPenguins = artifacts.require("TestPudgyPenguins");
const TestRektGuy = artifacts.require("TestRektGuy");
const TestSewerPass = artifacts.require("TestSewerPass");
const TestSmowls = artifacts.require("TestSmowls");
 
const nftAmmAddress = "0x6CF7d490e71Cbd74d3B859034CC863633CedE936";

module.exports = async (callback: () => any) => {
    const azuki = await TestAzuki.at("0x77db310ea562d9d633607061419737b0df0094d9");
    const bitBears = await TestBitBears.at("0x863b186314ef6feaad90cb10cecdec0bf0207769");
    const invisibleFriends = await TestInvisibleFriends.at("0x7aba3c318dd2f82737856f8e9072d6d964b669e2");
    const friendshipBracelets = await TestFriendshipBracelets.at("0xf44a0bbe07e49aba1b9b39882b5e1701fdbd0a00");
    const cryptoDickButts = await TestCryptoDickButts.at("0x0adfe20aaa076236c53f03dc956c8c2c21264f48");
    const doodles = await TestDoodles.at("0x53dde224f11d92b06839e66d594d6470b55d7fb7");
    const cloneX = await TestCloneX.at("0x76d4a43a8919cfe41c374f03b85af7ceca8b80a3");
    const checks = await TestChecks.at("0xfdd533c2cc6f066d74c6b5e28297098fd1ac1bb9");
    const captainz = await TestCaptainz.at("0x6ebe88df6ef176712e2a32dff48a459c1eaf0250");
    const boredApes = await TestBoredApes.at("0x07d5b6dc84e58f1fc044f757ea968e0a8f68a503");
    const mfers = await TestMfers.at("0x133e8f002c484db0408dba8d5d61bceae5daac45");
    const milady = await TestMilady.at("0x39724e1a449ce87a80ce98bb5c1f907192771acd");
    const moonbirds =await TestMoonbirds.at("0x601f3e80888ec3753afdce5e0b48b8e21743bdc5");
    const mutantApes = await TestMutantApes.at("0x2c71927940c1b0d31b09ca409d9105b9ebdccefe");
    const nakamigos = await TestNakamigos.at("0xa2782b3ee9f9b6f06112faa9d7480d360a723750");
    const mutantHoundCollars = await TestMutantHoundCollars.at("0xf5e5102ec2e831340d505a38e259eb8630bbe0f3");
    const pudgyPenguins = await TestPudgyPenguins.at("0x539b59ad0851300924f0f9ad08ac48a8384d966d");
    const rektGuy = await TestRektGuy.at("0x4eeb4c589494dbd082cb44529c12478992417df1");
    const sewerPass = await TestSewerPass.at("0xc1ad42b2b144925da64f47d353456fc7c4bae035");
    const smowls = await TestSmowls.at("0xb0d1140a09f669935b4848f6826fd16ff19787b9");

    console.log("Starting");

    console.log("Sending 100 azuki...");
    await azuki.issue(nftAmmAddress, 100);

    console.log("Sending 100 bitBears...");
    await bitBears.issue(nftAmmAddress, 100);

    console.log("Sending 100 boredApes...");
    await boredApes.issue(nftAmmAddress, 100);

    console.log("Sending 100 captainz...");
    await captainz.issue(nftAmmAddress, 100);

    console.log("Sending 100 checks...");
    await checks.issue(nftAmmAddress, 100);

    console.log("Sending 100 cloneX...");
    await cloneX.issue(nftAmmAddress, 100);

    console.log("Sending 100 cryptoDickButts...");
    await cryptoDickButts.issue(nftAmmAddress, 100);

    console.log("Sending 100 doodles...");
    await doodles.issue(nftAmmAddress, 100);

    console.log("Sending 100 friendshipBracelets...");
    await friendshipBracelets.issue(nftAmmAddress, 100);

    console.log("Sending 100 invisibleFriends...");
    await invisibleFriends.issue(nftAmmAddress, 100);

    console.log("Sending 100 mfers...");
    await mfers.issue(nftAmmAddress, 100);

    console.log("Sending 100 moonbirds...");
    await moonbirds.issue(nftAmmAddress, 100);

    console.log("Sending 100 mutantApes...");
    await mutantApes.issue(nftAmmAddress, 100);

    console.log("Sending 100 mutantHoundCollars...");
    await mutantHoundCollars.issue(nftAmmAddress, 100);

    console.log("Sending 100 milady...");
    await milady.issue(nftAmmAddress, 100);

    console.log("Sending 100 nakamigos...");
    await nakamigos.issue(nftAmmAddress, 100);

    console.log("Sending 100 pudgyPenguins...");
    await pudgyPenguins.issue(nftAmmAddress, 100);

    console.log("Sending 100 rektGuy...");
    await rektGuy.issue(nftAmmAddress, 100);

    console.log("Sending 100 sewerPass...");
    await sewerPass.issue(nftAmmAddress, 100);

    console.log("Sending 100 smowls...");
    await smowls.issue(nftAmmAddress, 100);

    console.log("Ending");
    callback();
}