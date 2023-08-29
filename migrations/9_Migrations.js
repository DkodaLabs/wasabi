const X2Y2Lending = artifacts.require("X2Y2Lending");

module.exports = async function (deployer, _network) {
  if (_network === "test") {

  } else {
    await deployer.deploy(X2Y2Lending);
  }
};
