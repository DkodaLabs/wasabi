const PricingConfigValidator = artifacts.require("PricingConfigValidator");

module.exports = function (deployer, _network, accounts) {
  deployer.deploy(PricingConfigValidator);
};