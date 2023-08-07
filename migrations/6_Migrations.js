const WasabiOptionArbitrage = artifacts.require("WasabiOptionArbitrage");
const WasabiBNPL = artifacts.require("WasabiBNPL");
const Flashloan = artifacts.require("Flashloan");
const LendingAddressProvider = artifacts.require("LendingAddressProvider");
const WETH9 = artifacts.require("WETH9");
const MockMarketplace = artifacts.require("MockMarketplace");
const MockLending = artifacts.require("MockLending");
const MockNFTLending = artifacts.require("MockNFTLending");

module.exports = async function (deployer, _network, accounts) {
  let factoryAddres = "0x8E2b50413a53F50E2a059142a9be060294961e40";
  let optionAddress;
  let wethAddress;

  if (_network === "test") {
    optionAddress = "0x0000000000000000000000000000000000000000";

    await deployer.deploy(WETH9);
    wethAddress = WETH9.address;

    await deployer.deploy(MockMarketplace, wethAddress);

    await deployer.deploy(MockLending, wethAddress);
    await deployer.deploy(MockNFTLending, MockLending.address);
  } else if (_network === "mainnet" || _network === "mainnet-fork") {
    optionAddress = "0xfc68f2130e094c95b6c4f5494158cbeb172e18a0";
    wethAddress = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
  } else {
    // Goerli
    optionAddress = "0x5b4f805ddee87489bcfe04dc2f2d47aeb5150fdb";
    wethAddress = "0xb4fbf271143f4fbf7b91a5ded31805e42b2208d6";
  }

  await deployer.deploy(WasabiOptionArbitrage, optionAddress, wethAddress);

  await deployer.deploy(Flashloan);
  await deployer.deploy(LendingAddressProvider);

  await deployer.deploy(
    WasabiBNPL,
    optionAddress,
    Flashloan.address,
    LendingAddressProvider.address,
    wethAddress,
    factoryAddres
  );
};
