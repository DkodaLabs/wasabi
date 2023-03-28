const HDWalletProvider = require("@truffle/hdwallet-provider");
require('dotenv').config();

require("ts-node").register({
  files: true,
});
const { 
  GOERLI_API_URL, GOERLI_MNEMONIC, GOERLI_PRIVATE_KEY,
  API_URL, PRIVATE_KEY,
  ETHERSCAN_API_KEY
 } = process.env;

module.exports = {
  networks: {
    // development: {
    //   host: "127.0.0.1",
    //   port: 8545,
    //   network_id: "*"
    // },
    goerli: {
      provider: () => new HDWalletProvider(GOERLI_PRIVATE_KEY, GOERLI_API_URL),
      network_id: '5',
    },
    mainnet: {
      provider: () => new HDWalletProvider(PRIVATE_KEY, API_URL),
      network_id: '1',
    },
    // dashboard: {
    // }
  },
  compilers: {
    solc: {
      version: "0.8.13",
      settings: {
        optimizer: {
          enabled: true,
          runs: 1500
        }
      }
    }
  },
  db: {
    // enabled: false,
    // host: "127.0.0.1",
  },
  plugins: ['truffle-plugin-verify'],
  api_keys: {
    etherscan: ETHERSCAN_API_KEY,
  },
};
