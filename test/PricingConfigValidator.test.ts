import { signPriceConfig} from "./util/TestUtils";
import { PricingConfig} from "./util/TestTypes";
import { PricingConfigValidatorInstance } from "../types/truffle-contracts/PricingConfigValidator";

const PricingConfigValidator = artifacts.require("PricingConfigValidator");

contract("PricingConfigValidator", (accounts) => {
  let priceConfigValidator: PricingConfigValidatorInstance;
  const buyer = accounts[3];
  const validPrivateKey = "c88b703fb08cbea894b6aeff5a544fb92e78a18e19814cd85da83b71f772aa6c";
  const inValidPivateKey = "ae6ae8e5ccbfb04590405997ee2d52d2b330726137b875053c36d94e974d162f";

  before("Prepare State", async function () {
    priceConfigValidator = await PricingConfigValidator.deployed();
  });

  it("Verify signer", async () => {

    const priceConfig: PricingConfig = {

      poolAddress: "0x0000000000000000000000000000000000000000",
      premiumMultiplierPercent: 30,
      blockNumber: 16000,
    };

    const signature = await signPriceConfig(
      priceConfig,
      priceConfigValidator.address,
      validPrivateKey
    ); // buyer signs it

    assert.equal(
      await priceConfigValidator.getSigner(priceConfig, signature),
      buyer,
      "invalid signer"
    );
  });

  it("Verify signer - Invalid Signer", async () => {

    const priceConfig: PricingConfig = {

      poolAddress: "0x0000000000000000000000000000000000000000",
      premiumMultiplierPercent: 30,
      blockNumber: 16000,
    };

    const signature = await signPriceConfig(
      priceConfig,
      priceConfigValidator.address,
      inValidPivateKey
    ); // buyer signs it

    assert.notEqual(
      await priceConfigValidator.getSigner(priceConfig, signature),
      buyer
    );
  });
});
