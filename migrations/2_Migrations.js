const TestPudgyPenguins = artifacts.require("TestPudgyPenguins");

module.exports = function (deployer, _network, accounts) {
  deployer.deploy(TestPudgyPenguins);
};