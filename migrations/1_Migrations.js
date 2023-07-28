const WasabiStructs = artifacts.require("WasabiStructs");
const PoolAskVerifier = artifacts.require("PoolAskVerifier");
const PoolBidVerifier = artifacts.require("PoolBidVerifier");
const WasabiOption = artifacts.require("WasabiOption");
const ETHWasabiPool = artifacts.require("ETHWasabiPool");
const ERC20WasabiPool = artifacts.require("ERC20WasabiPool");
const WasabiPoolFactory = artifacts.require("WasabiPoolFactory");
const WasabiConduit = artifacts.require("WasabiConduit");
const WasabiFeeManager = artifacts.require("WasabiFeeManager");

module.exports = async function (deployer, _network, accounts) {
  await deployer.deploy(WasabiStructs);
  await deployer.deploy(PoolAskVerifier);
  await deployer.deploy(PoolBidVerifier);
  await deployer.deploy(WasabiOption);
  await deployer.link(PoolAskVerifier, [ETHWasabiPool, ERC20WasabiPool]);
  await deployer.link(PoolBidVerifier, [ETHWasabiPool, ERC20WasabiPool]);
  await deployer.deploy(ETHWasabiPool);
  await deployer.deploy(ERC20WasabiPool);
  if (_network === 'mainnet') {
    await deployer.deploy(WasabiFeeManager, 200, 10000);
  } else {
    await deployer.deploy(WasabiFeeManager, 0, 10000);
  }
  await deployer.deploy(WasabiConduit, WasabiOption.address);
  await deployer.deploy(WasabiPoolFactory, WasabiOption.address, ETHWasabiPool.address, ERC20WasabiPool.address, WasabiFeeManager.address, WasabiConduit.address);
};