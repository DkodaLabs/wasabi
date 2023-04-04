# Wasabi

## Resources

* Read our [White Paper](https://docsend.com/view/zzmt4vkze5aky2ya) to see how the general idea works

## 1. Prerequisite
You should have already installed the following things beforehand:

- [Node JS](https://nodejs.org/en/)
- Truffle

  ```node
  npm i -g truffle
  ```

- [Git Bash](https://git-scm.com/downloads)
- [Download and Install VSCode](https://code.visualstudio.com/download)

## 2. Running Tests
- Once you have completed all the steps from the [Prerequisite](./README.md#1-Prerequisite), go ahead and install the rest of the dependencies.

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