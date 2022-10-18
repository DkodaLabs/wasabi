const HDWalletProvider = require("@truffle/hdwallet-provider");
require('dotenv').config();

require("ts-node").register({
  files: true,
});
const { API_URL, MNEMONIC, PRIVATE_KEY } = process.env;

module.exports = {
  networks: {
    development: {
      host: "127.0.0.1",
      port: 8545,
      network_id: "*"
    },
    goerli: {
      provider: () =>
        new HDWalletProvider(PRIVATE_KEY, API_URL),
      network_id: '5',
    }
    // dashboard: {
    // }
  },
  compilers: {
    solc: {
      version: "0.8.13",
    }
  },
  db: {
    // enabled: false,
    // host: "127.0.0.1",
  }
};
