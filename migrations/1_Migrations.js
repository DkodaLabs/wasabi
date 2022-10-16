const IWasabiPool = artifacts.require("IWasabiPool");
const Signing = artifacts.require("Signing");
const WasabiStructs = artifacts.require("WasabiStructs");
const WasabiValidation = artifacts.require("WasabiValidation");
const WasabiOption = artifacts.require("WasabiOption");
const WasabiPool = artifacts.require("WasabiPool");
const WasabiPoolFactory = artifacts.require("WasabiPoolFactory");
const TestERC721 = artifacts.require("TestERC721");

module.exports = function (deployer, _network, accounts) {
  console.log("test net", _network);
  deployer.deploy(TestERC721)
    .then(() => deployer.deploy(WasabiStructs))
    .then(() => deployer.deploy(Signing))
    .then(() => deployer.deploy(WasabiValidation))
    .then(() => deployer.deploy(WasabiOption))
    .then(() => deployer.link(Signing, WasabiPool))
    .then(() => deployer.link(WasabiValidation, WasabiPool))
    .then(() => deployer.deploy(WasabiPool))
    .then(() => deployer.link(WasabiValidation, WasabiPoolFactory))
    .then(() => deployer.deploy(WasabiPoolFactory, WasabiOption.address, WasabiPool.address));
};