const TestBitBears = artifacts.require("TestBitBears");

module.exports = function (deployer, _network, accounts) {
  deployer.deploy(TestBitBears);
};