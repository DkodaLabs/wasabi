const DemoETH = artifacts.require("DemoETH");

module.exports = function (deployer, _network, accounts) {
  deployer.deploy(DemoETH);
};