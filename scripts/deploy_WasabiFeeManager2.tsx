const { ethers } = require('hardhat');

async function deploy_WasabiFeeManager2() {
  const wasabiPassAddress = "0x2d850f76c671aa2e1c1892a0644c115eb254d165";
  const wasabiPassId = 1;
  const fraction = 200; // 2 %
  const denominator = 10_000;
  const unitDiscount = 15; // 0.15 %

  const feeManager = await ethers.deployContract("WasabiFeeManager2", [wasabiPassAddress, wasabiPassId, fraction, denominator, unitDiscount]);

  console.log('WasabiFeeManager2 was deployed at ', await feeManager.getAddress());
}

deploy_WasabiFeeManager2()
.then(() => process.exit(0))
.catch((error) => {
  console.error(error);
  process.exitCode = 1;
});