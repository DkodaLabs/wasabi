const { ethers } = require('hardhat');

async function deploy_TellerLending() {
  const loanCore = "0x00182FdB0B880eE24D428e3Cc39383717677C37e";
  const weth = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

  const arcade = await ethers.deployContract("TellerLending", [weth, loanCore]);

  console.log('TellerLending was deployed at ', await arcade.getAddress());
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
deploy_TellerLending()
.then(() => process.exit(0))
.catch((error) => {
  console.error(error);
  process.exitCode = 1;
});