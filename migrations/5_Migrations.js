const TestSmowls = artifacts.require("TestSmowls");
const TestNakamigos = artifacts.require("TestNakamigos");

module.exports = function (deployer, _network, accounts) {
  deployer.deploy(TestSmowls)
    .then(() => deployer.deploy(TestNakamigos));
};