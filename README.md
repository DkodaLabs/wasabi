# Wasabi

## Resources

* Read our [White Paper](Wasabi%20Whitepaper.pdf) to see how the general idea works

## 1. Prerequisite
You should have already installed the following things beforehand:

- [Node JS](https://nodejs.org/en/)
- Truffle

  ```node
  npm i -g truffle
  ```

- [Git Bash](https://git-scm.com/downloads)
- [Download and Install VSCode](https://code.visualstudio.com/download)

## 2. Setup

- Make a copy of ``.env example`` and rename it into ``.env``
- Open the .env and fill up the given variables.
- You can get your [Nownodes](https://nownodes.io/) or
  [Tatum](https://tatum.io/) API's from their website.
- The mnemonics from the .env will be used for truffle console and creating local development blockchain using ganache.

## 3. Running Tests
- Once you have completed all the steps from the [setup section](./README.md#2-setup), go ahead and install the rest of the dependencies.

```node
npm install
```
- This will install all the other dependencies listed on `package.json`

To generate `types` the following scripts can be used.

```
// For generating the types.
npm run generate-types

// For compiling and generating the types.
npm run postinstall
```


- To compile and test the contract, the following scripts can be used. 

```
// For compiling the contracts.
truffle compile

// For testing the contracts.
truffle test
```