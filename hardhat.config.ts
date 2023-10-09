import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import { HardhatUserConfig, NetworkUserConfig } from "hardhat/types";

import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-etherscan";
import "@nomiclabs/hardhat-waffle";

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.19",
        settings: {
          viaIR: true,
          optimizer: {
            enabled: true,
            runs: 1000,
          },
        },
      },
    ],
  },
  networks: {
    // Development
    hardhat: {
      accounts: {
        // Custom mnemonic so that the wallets have no initial state
        mnemonic:
          "void forward involve old phone resource sentence fall friend wait strike copper urge reduce chapter",
      },
    },
    localhost: {
      url: "http://127.0.0.1:8545"
    },
    // Testnets
    goerli: {
      url: process.env.API_URL,
      accounts: [process.env.PRIVATE_KEY as string]
    },
    // Mainnets
    mainnet: {
      url: process.env.API_URL,
      accounts: [process.env.PRIVATE_KEY as string]
    }
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
  mocha: {
    timeout: 60000 * 10,
  },
};

export default config;
