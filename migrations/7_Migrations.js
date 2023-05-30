const SigningV2 = artifacts.require("SigningV2");
const WasabiStructsV2 = artifacts.require("WasabiStructsV2");
const PoolAskVerifierV2 = artifacts.require("PoolAskVerifierV2");
const PoolBidVerifierV2 = artifacts.require("PoolBidVerifierV2");
const WasabiOption = artifacts.require("WasabiOption");
const ETHWasabiPoolV2 = artifacts.require("ETHWasabiPoolV2");
const ERC20WasabiPoolV2 = artifacts.require("ERC20WasabiPoolV2");
const WasabiPoolFactoryV2 = artifacts.require("WasabiPoolFactoryV2");
const WasabiConduitV2 = artifacts.require("WasabiConduitV2");
const WasabiFeeManager = artifacts.require("WasabiFeeManager");

module.exports = async function (deployer, _network, accounts) {
  await deployer.deploy(WasabiStructsV2);
  await deployer.deploy(SigningV2);
  await deployer.link(SigningV2,[PoolAskVerifierV2, PoolBidVerifierV2]);
  await deployer.deploy(PoolAskVerifierV2);
  await deployer.deploy(PoolBidVerifierV2);
  await deployer.deploy(WasabiOption);
  await deployer.link(PoolAskVerifierV2, [ETHWasabiPoolV2, ERC20WasabiPoolV2]);
  await deployer.link(PoolBidVerifierV2, [ETHWasabiPoolV2, ERC20WasabiPoolV2]);
  await deployer.deploy(ETHWasabiPoolV2);
  await deployer.deploy(ERC20WasabiPoolV2);
  if (_network === 'mainnet') {
    await deployer.deploy(WasabiFeeManager, 200, 10000);
  } else {
    await deployer.deploy(WasabiFeeManager, 0, 10000);
  }
  await deployer.link(SigningV2, [WasabiConduitV2]);
  await deployer.deploy(WasabiConduitV2, WasabiOption.address);
  await deployer.deploy(WasabiPoolFactoryV2, WasabiOption.address, ETHWasabiPoolV2.address, ERC20WasabiPoolV2.address, WasabiFeeManager.address, WasabiConduitV2.address);
};