const IWasabiPool = artifacts.require("IWasabiPool");
const Signing = artifacts.require("Signing");
const WasabiStructs = artifacts.require("WasabiStructs");
const WasabiValidation = artifacts.require("WasabiValidation");
const WasabiOption = artifacts.require("WasabiOption");
const ETHWasabiPool = artifacts.require("ETHWasabiPool");
const ERC20WasabiPool = artifacts.require("ERC20WasabiPool");
const WasabiPoolFactory = artifacts.require("WasabiPoolFactory");
const TestERC721 = artifacts.require("TestERC721");

module.exports = function (deployer, _network, accounts) {
  deployer.deploy(TestERC721)
    .then(() => deployer.deploy(WasabiStructs))
    .then(() => deployer.deploy(Signing))
    .then(() => deployer.deploy(WasabiValidation))
    .then(() => deployer.deploy(WasabiOption))
    .then(() => deployer.link(Signing, [ETHWasabiPool, ERC20WasabiPool]))
    .then(() => deployer.link(WasabiValidation, [ETHWasabiPool, ERC20WasabiPool]))
    .then(() => deployer.deploy(ETHWasabiPool))
    .then(() => deployer.deploy(ERC20WasabiPool))
    .then(() => deployer.link(WasabiValidation, WasabiPoolFactory))
    .then(() => deployer.deploy(WasabiPoolFactory, WasabiOption.address, ETHWasabiPool.address, ERC20WasabiPool.address));
};