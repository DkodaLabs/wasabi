import { signPriceConfig} from "./util/TestUtils";
import { PricingConfig} from "./util/TestTypes";
import { PricingConfigValidatorInstance } from "../types/truffle-contracts/PricingConfigValidator";

const PricingConfigValidator = artifacts.require("PricingConfigValidator");

contract("PricingConfigValidator", (accounts) => {
  let priceConfigValidator: PricingConfigValidatorInstance;
  const buyer = accounts[3];

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
      priceConfigValidator.address
    ); // buyer signs it

    assert.equal(
      await priceConfigValidator.getSigner(priceConfig, signature),
      buyer,
      "invalid signer"
    );
  });
});
