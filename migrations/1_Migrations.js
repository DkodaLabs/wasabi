const Signing = artifacts.require("Signing");
const WasabiStructs = artifacts.require("WasabiStructs");
const PoolAskVerifier = artifacts.require("PoolAskVerifier");
const PoolBidVerifier = artifacts.require("PoolBidVerifier");
const WasabiOption = artifacts.require("WasabiOption");
const ETHWasabiPool = artifacts.require("ETHWasabiPool");
const ERC20WasabiPool = artifacts.require("ERC20WasabiPool");
const WasabiPoolFactory = artifacts.require("WasabiPoolFactory");
const WasabiConduit = artifacts.require("WasabiConduit");
const WasabiFeeManager = artifacts.require("WasabiFeeManager");

module.exports = function (deployer, _network, accounts) {
  deployer.deploy(WasabiStructs)
    .then(() => deployer.deploy(Signing))
    .then(() => deployer.link(Signing,[PoolAskVerifier, PoolBidVerifier]))
    .then(() => deployer.deploy(PoolAskVerifier))
    .then(() => deployer.deploy(PoolBidVerifier))
    .then(() => deployer.deploy(WasabiOption))
    .then(() => deployer.link(Signing, [WasabiConduit]))
    .then(() => deployer.deploy(WasabiConduit))
    .then(() => deployer.link(PoolAskVerifier, [ETHWasabiPool, ERC20WasabiPool]))
    .then(() => deployer.link(PoolBidVerifier, [ETHWasabiPool, ERC20WasabiPool]))
    .then(() => deployer.deploy(ETHWasabiPool))
    .then(() => deployer.deploy(ERC20WasabiPool))
    .then(() => deployer.deploy(WasabiFeeManager))
    .then(() => deployer.deploy(WasabiPoolFactory, WasabiOption.address, ETHWasabiPool.address, ERC20WasabiPool.address, WasabiFeeManager.address, WasabiConduit.address));
};