const TestMfers = artifacts.require("TestMfers");

module.exports = function (deployer, _network, accounts) {
  deployer.deploy(TestMfers);
};