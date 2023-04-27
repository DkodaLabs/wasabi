const WasabiOptionArbitrage = artifacts.require("WasabiOptionArbitrage");
const MockAavePool = artifacts.require("MockAavePool");
const WETH9 = artifacts.require("WETH9");
const MockMarketplace = artifacts.require("MockMarketplace");
const Signing = artifacts.require("Signing");

module.exports = async function (deployer, _network, accounts) {
  let optionAddress;
  let aaveAddressProvider;
  let wethAddress;
  if (_network === 'test') {
    optionAddress = "0x0000000000000000000000000000000000000000";

    await deployer.deploy(WETH9);
    wethAddress = WETH9.address;

    await deployer.deploy(MockAavePool, wethAddress);
    aaveAddressProvider = MockAavePool.address;

    await deployer.deploy(MockMarketplace, wethAddress);
  } else if (_network === 'mainnet') {
    optionAddress = "0xfc68f2130e094c95b6c4f5494158cbeb172e18a0";
    aaveAddressProvider = "0x2f39d218133AFaB8F2B819B1066c7E434Ad94E9e";
    wethAddress = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
  } else { // Goerli
    optionAddress = "0x5b4f805ddee87489bcfe04dc2f2d47aeb5150fdb";
    wethAddress = "0xb4fbf271143f4fbf7b91a5ded31805e42b2208d6";

    await deployer.deploy(MockAavePool, wethAddress);
    aaveAddressProvider = MockAavePool.address;
  }
  await deployer.deploy(Signing);
  await deployer.link(Signing, [WasabiOptionArbitrage]);
  await deployer.deploy(WasabiOptionArbitrage, optionAddress, aaveAddressProvider, wethAddress);
};