const PricingConfigValidator = artifacts.require("PricingConfigValidator");
const Signing = artifacts.require("Signing");

module.exports = function (deployer, _network, accounts) {
  deployer.deploy(Signing)
    .then(() => deployer.link(Signing, PricingConfigValidator))
    .then(() => deployer.deploy(PricingConfigValidator));
};