const TestBoredApes = artifacts.require("TestBoredApes");

module.exports = function (deployer, _network, accounts) {
  deployer.deploy(TestBoredApes);
};