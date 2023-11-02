const { ethers } = require('hardhat');

async function deploy_WasabiBNPL2() {
  const wasabiOption = "0xFc68f2130e094C95B6C4F5494158cbeB172e18a0";
  const flashloan = "0x001a05856e823efdb78ddcf0cf209f69dd6e6f3d";
  const lendingAddressProvider = "0xc399616937ebace9e45159a60cd77663c4a30e79";
  const weth = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
  const poolFactory = "0x8E2b50413a53F50E2a059142a9be060294961e40";

  const bnpl2 = await ethers.deployContract("WasabiBNPL2", [wasabiOption, flashloan, lendingAddressProvider, weth, poolFactory]);

  console.log('WasabiBNPL2 was deployed at ', bnpl2);

  // npx hardhat verify --network mainnet 0xdaf28ddb794373f3124ee2b0b69c2aaf478aeb89 0xFc68f2130e094C95B6C4F5494158cbeB172e18a0 0x001a05856e823efdb78ddcf0cf209f69dd6e6f3d 0xc399616937ebace9e45159a60cd77663c4a30e79 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2 0x8E2b50413a53F50E2a059142a9be060294961e40
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
deploy_WasabiBNPL2()
.then(() => process.exit(0))
.catch((error) => {
  console.error(error);
  process.exitCode = 1;
});