const WasabiConduit = artifacts.require("WasabiConduit");
const BNPLOptionBidValidator = artifacts.require("BNPLOptionBidValidator");

module.exports = async function (deployer, _network) {
    if (_network === 'mainnet') {
        await deployer.link(BNPLOptionBidValidator, WasabiConduit);
        await deployer.deploy(
            WasabiConduit,
            "0xFc68f2130e094C95B6C4F5494158cbeB172e18a0",
            "0xead3dd83ed1e107e02e1d0a307d4f1ba8a2af12d",
            "0x8E2b50413a53F50E2a059142a9be060294961e40");
  } else {
  }
};
