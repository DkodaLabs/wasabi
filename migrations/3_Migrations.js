const WasabiDemoToken = artifacts.require("WasabiDemoToken");

module.exports = function (deployer, _network, accounts) {
  deployer.deploy(WasabiDemoToken);
};