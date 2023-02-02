const TestSignature = artifacts.require("TestSignature");
const WasabiStructs = artifacts.require("WasabiStructs");
const Signing = artifacts.require("Signing");

module.exports = function (deployer, _network, accounts) {
  deployer.deploy(WasabiStructs)
    .then(() => deployer.deploy(Signing))
    .then(() => deployer.link(Signing, TestSignature))
    .then(() => deployer.link(WasabiStructs, TestSignature))
    .then(() => deployer.deploy(TestSignature));
};