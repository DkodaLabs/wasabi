const TestTerraforms = artifacts.require("TestTerraforms");

module.exports = function (deployer, _network, accounts) {
  deployer.deploy(TestTerraforms);
};