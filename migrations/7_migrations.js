const FlashLoan = artifacts.require("FlashLoan");
const MockLending = artifacts.require("MockLending");
const MockNFTLending = artifacts.require("MockNFTLending");
const LendingAddressProvider = artifacts.require("LendingAddressProvider");
const WasabiBNPL = artifacts.require("WasabiBNPL");

module.exports = async function (deployer, _network) {
  let factoryAddres = "0x8E2b50413a53F50E2a059142a9be060294961e40";
  let optionAddress;
  let wethAddress;

  if (_network === "test") {
    optionAddress = "0x0000000000000000000000000000000000000000";

    await deployer.deploy(WETH9);
    wethAddress = WETH9.address;

    await deployer.deploy(MockLending, wethAddress);
    await deployer.deploy(MockNFTLending);
  } else {
    optionAddress = "0xfc68f2130e094c95b6c4f5494158cbeb172e18a0";
    wethAddress = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
  }

  await deployer.deploy(FlashLoan);
  await deployer.deploy(LendingAddressProvider);

  await deployer.deploy(
    WasabiBNPL,
    optionAddress,
    FlashLoan.address,
    LendingAddressProvider.address,
    wethAddress,
    factoryAddres
  );
};
