const WasabiFeeManager2 = artifacts.require("WasabiFeeManager2");
const WasabiFeeManager3 = artifacts.require("WasabiFeeManager3");
const TestWasabiPass = artifacts.require("TestWasabiPass");

module.exports = async function (deployer, _network, accounts) {
  if (_network === 'mainnet') {
    const wasabiPassAddress = "0x2d850f76c671aa2e1c1892a0644c115eb254d165";
    const wasabiPassId = 1;
    await deployer.deploy(WasabiFeeManager2, wasabiPassAddress, wasabiPassId, 200, 10000, 15);
    await deployer.deploy(WasabiFeeManager3, wasabiPassAddress, wasabiPassId, 200, 10000, 15, []);
  } else {
    await deployer.deploy(TestWasabiPass);
    await deployer.deploy(WasabiFeeManager2, TestWasabiPass.address, 1, 200, 10000, 15);
    await deployer.deploy(WasabiFeeManager3, TestWasabiPass.address, 1, 200, 10000, 15, []);
  }
};