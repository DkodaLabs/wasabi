const IWasabiPool = artifacts.require("IWasabiPool");
const Signing = artifacts.require("Signing");
const WasabiStructs = artifacts.require("WasabiStructs");
const WasabiValidation = artifacts.require("WasabiValidation");
const WasabiOption = artifacts.require("WasabiOption");
const WasabiPool = artifacts.require("WasabiPool");
const WasabiPoolFactory = artifacts.require("WasabiPoolFactory");

module.exports = function (deployer, _network, accounts) {
  deployer.deploy(WasabiStructs)
    .then(() => deployer.deploy(Signing))
    .then(() => deployer.deploy(WasabiValidation))
    .then(() => deployer.deploy(WasabiOption))
    .then(() => deployer.link(Signing, WasabiPool))
    .then(() => deployer.link(WasabiValidation, WasabiPool))
    .then(() => deployer.deploy(WasabiPool))
    .then(() => deployer.link(WasabiValidation, WasabiPoolFactory))
    .then(() => deployer.deploy(WasabiPoolFactory, WasabiOption.address, WasabiPool.address));
};