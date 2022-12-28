const Signing = artifacts.require("Signing");
const WasabiStructs = artifacts.require("WasabiStructs");
const WasabiValidation = artifacts.require("WasabiValidation");
const WasabiOption = artifacts.require("WasabiOption");
const ETHWasabiPool = artifacts.require("ETHWasabiPool");
const ERC20WasabiPool = artifacts.require("ERC20WasabiPool");
const WasabiPoolFactory = artifacts.require("WasabiPoolFactory");

module.exports = function (deployer, _network, accounts) {
  deployer.deploy(WasabiStructs)
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