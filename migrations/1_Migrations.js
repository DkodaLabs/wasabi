const Signing = artifacts.require("Signing");
const WasabiStructs = artifacts.require("WasabiStructs");
const WasabiOption = artifacts.require("WasabiOption");
const WasabiPool = artifacts.require("WasabiPool");
const WasabiPoolFactory = artifacts.require("WasabiPoolFactory");
const TestERC721 = artifacts.require("TestERC721");

module.exports = function (deployer, _network, accounts) {
  
  deployer.deploy(WasabiStructs)
    .then(() => deployer.deploy(Signing))
    .then(() => deployer.deploy(WasabiOption))
    .then(() => deployer.link(Signing, WasabiPool))
    .then(() => deployer.deploy(WasabiPool, WasabiOption.address))
    .then(() => deployer.deploy(WasabiPoolFactory, WasabiOption.address, WasabiPool.address));
  deployer.deploy(TestERC721);
};