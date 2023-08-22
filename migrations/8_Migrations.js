const WasabiOptionArbitrageV2 = artifacts.require("WasabiOptionArbitrageV2");

module.exports = async function (deployer, _network) {
  if (_network === "test") {

  } else {

    const flashLoanAddress = "0x001a05856e823efdb78ddcf0cf209f69dd6e6f3d";
    const optionAddress = "0xFc68f2130e094C95B6C4F5494158cbeB172e18a0";
    const wethAddress = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

    await deployer.deploy(WasabiOptionArbitrageV2, optionAddress, wethAddress, flashLoanAddress);
  }
};
