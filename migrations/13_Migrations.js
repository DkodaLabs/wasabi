const WasabiBNPL2 = artifacts.require("WasabiBNPL2");

module.exports = async function (deployer, _network, accounts) {
  const wasabiOption = "0xFc68f2130e094C95B6C4F5494158cbeB172e18a0";
  const flashloan = "0x001a05856e823efdb78ddcf0cf209f69dd6e6f3d";
  const lendingAddressProvider = "0xc399616937ebace9e45159a60cd77663c4a30e79";
  const weth = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
  const poolFactory = "0x8E2b50413a53F50E2a059142a9be060294961e40";
  await deployer.deploy(WasabiBNPL2, wasabiOption, flashloan, lendingAddressProvider, weth, poolFactory);
};