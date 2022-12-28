const OptionFMVPurchaser = artifacts.require("OptionFMVPurchaser");
const MockStructs = artifacts.require("MockStructs");
const MockArbitrage = artifacts.require("MockArbitrage");
const NFTAMM = artifacts.require("NFTAMM");
const Signing = artifacts.require("Signing");
const DemoETH = artifacts.require("DemoETH");

module.exports = function (deployer, _network, accounts) {
  deployer.deploy(DemoETH)
    .then(() => deployer.deploy(Signing))
    .then(() => deployer.deploy(MockStructs))
    // Link
    .then(() => deployer.link(Signing, [NFTAMM, OptionFMVPurchaser]))
    .then(() => deployer.link(MockStructs, [NFTAMM, MockArbitrage]))
    // Deploy
    .then(() => deployer.deploy(NFTAMM, DemoETH.address))
    .then(() => deployer.deploy(OptionFMVPurchaser, DemoETH.address))
    .then(() => deployer.deploy(MockArbitrage, DemoETH.address, NFTAMM.address));
};