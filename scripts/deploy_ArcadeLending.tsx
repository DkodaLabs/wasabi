const { ethers } = require('hardhat');

async function deploy_ArcadeLending() {
  const originationController = "0xB7BFcca7D7ff0f371867B770856FAc184B185878";
  const loanCore = "0x89bc08BA00f135d608bc335f6B33D7a9ABCC98aF";
  const repaymentController = "0x74241e1A9c021643289476426B9B70229Ab40D53";
  const weth = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

  const arcade = await ethers.deployContract("ArcadeLending", [originationController, loanCore, repaymentController, weth]);

  console.log('ArcadeLending was deployed at ', await arcade.getAddress());
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
deploy_ArcadeLending()
.then(() => process.exit(0))
.catch((error) => {
  console.error(error);
  process.exitCode = 1;
});