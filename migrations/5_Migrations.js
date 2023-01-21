const TestSewerPass = artifacts.require("TestSewerPass");

module.exports = function (deployer, _network, accounts) {
  deployer.deploy(TestSewerPass);
};