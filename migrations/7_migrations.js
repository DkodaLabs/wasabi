const FlashLoan = artifacts.require("FlashLoan");
const MockLending = artifacts.require("MockLending");
const MockZharta = artifacts.require("MockZharta");
const MockNFTLending = artifacts.require("MockNFTLending");
const LendingAddressProvider = artifacts.require("LendingAddressProvider");
const WasabiBNPL = artifacts.require("WasabiBNPL");
const WETH9 = artifacts.require("WETH9");
const ZhartaLending = artifacts.require("ZhartaLending");
const ZhartaLendingConstantFix = artifacts.require("ZhartaLendingConstantFix");
const NFTfiLending = artifacts.require("NFTfiLending");
const ArcadeLending = artifacts.require("ArcadeLending");
const MockArcadeLendingContract = artifacts.require("MockArcadeLendingContract");

module.exports = async function (deployer, _network) {
  const zharteLoanPeripheral = "0xaF2F471d3B46171f876f465165dcDF2F0E788636";
  const zhartaLoansCore = "0x5Be916Cff5f07870e9Aef205960e07d9e287eF27";
  const zhartaCollateralVault = "0x7CA34cF45a119bEBEf4D106318402964a331DfeD";

  let factoryAddres = "0x8E2b50413a53F50E2a059142a9be060294961e40";
  let optionAddress;
  let wethAddress;

  if (_network === "test") {
    optionAddress = "0x0000000000000000000000000000000000000000";

    await deployer.deploy(WETH9);
    wethAddress = WETH9.address;

    await deployer.deploy(MockZharta);
    await deployer.deploy(ZhartaLending, MockZharta.address, MockZharta.address, MockZharta.address);

    await deployer.deploy(MockArcadeLendingContract, wethAddress);
    await deployer.deploy(MockNFTLending, MockArcadeLendingContract.address);

    const mockLendingAddress = MockArcadeLendingContract.address;
    await deployer.deploy(ArcadeLending, mockLendingAddress, mockLendingAddress, mockLendingAddress, wethAddress);
  } else {
    // optionAddress = "0xfc68f2130e094c95b6c4f5494158cbeb172e18a0";
    // wethAddress = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

    await deployer.deploy(ZhartaLending, zharteLoanPeripheral, zhartaLoansCore, zhartaCollateralVault);
    await deployer.deploy(ZhartaLendingConstantFix, zharteLoanPeripheral, zhartaLoansCore, zhartaCollateralVault);
    // await deployer.deploy(NFTfiLending);
  }

  await deployer.deploy(FlashLoan);
  await deployer.deploy(LendingAddressProvider);

  await deployer.deploy(
    WasabiBNPL,
    optionAddress,
    FlashLoan.address,
    LendingAddressProvider.address,
    wethAddress,
    factoryAddres
  );
};
