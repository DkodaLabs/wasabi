import { signPriceConfig} from "./util/TestUtils";
import { PricingConfig} from "./util/TestTypes";
import { PricingConfigValidatorInstance } from "../types/truffle-contracts/PricingConfigValidator";

const PricingConfigValidator = artifacts.require("PricingConfigValidator");

contract("PricingConfigValidator", (accounts) => {
  let priceConfigValidator: PricingConfigValidatorInstance;
  const buyer = accounts[3];
  const buyerPrivateKey = "c88b703fb08cbea894b6aeff5a544fb92e78a18e19814cd85da83b71f772aa6c";
  const someoneElsePrivateKey = "659cbb0e2411a44db63778987b1e22153c086a95eb6b18bdf89de078917abc63";

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
      buyerPrivateKey
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
      someoneElsePrivateKey
    ); // buyer signs it

    assert.notEqual(
      await priceConfigValidator.getSigner(priceConfig, signature),
      buyer
    );
  });
});
