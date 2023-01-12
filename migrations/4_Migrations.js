const WasabiConduit = artifacts.require("WasabiConduit");
// const WasabiStructs = artifacts.require("WasabiStructs");

module.exports = function (deployer, _network, accounts) {
  deployer.deploy(WasabiConduit);
};