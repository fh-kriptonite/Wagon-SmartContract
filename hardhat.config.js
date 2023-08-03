require("@nomicfoundation/hardhat-toolbox");
require('@openzeppelin/hardhat-upgrades');

require('dotenv').config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: { 
    compilers: [
      {
        version:"0.8.9", 
        settings: { 
          optimizer: { 
            enabled: true, 
            runs: 200 
          }
        },
      }
    ]
  },
  networks: {
    // for mainnet
    'base-mainnet': {
      url: 'https://developer-access-mainnet.base.org',
      accounts: [process.env.WALLET_KEY],
      gasPrice: 1000000000,
    },
    // for testnet
    'base-goerli': {
      url: 'https://goerli.base.org',
      accounts: [process.env.WALLET_KEY],
      gasPrice: 1000000000,
    },
    // for local dev environment
    'base-local': {
      url: 'http://localhost:8545',
      accounts: [process.env.WALLET_KEY],
      gasPrice: 1000000000,
    },
  },
  etherscan: {
    apiKey: {
     "base-goerli": process.env.BASESCAN_APY_KEY
    },
    customChains: [
      {
        network: "base-goerli",
        chainId: 84531,
        urls: {
         apiURL: "https://api-goerli.basescan.org/api",
         browserURL: "https://goerli.basescan.org"
        }
      }
    ]
  },
};
