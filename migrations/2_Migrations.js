const TestAzuki = artifacts.require("TestAzuki");

module.exports = function (deployer, _network, accounts) {
  deployer.deploy(TestAzuki);
};