const WasabiConduit = artifacts.require("WasabiConduit");
const Signing = artifacts.require("Signing");

module.exports = function (deployer, _network, accounts) {
  deployer.deploy(Signing)
    .then(() => deployer.link(Signing, WasabiConduit))
    .then(() => deployer.deploy(WasabiConduit));
};