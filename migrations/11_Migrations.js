const ArcadeLending = artifacts.require("ArcadeLending");

module.exports = async function (deployer, _network) {
    if (_network === 'mainnet') {
        let originationController = "0xB7BFcca7D7ff0f371867B770856FAc184B185878";
        let loanCore = "0x89bc08BA00f135d608bc335f6B33D7a9ABCC98aF";
        let repaymentController = "0x74241e1A9c021643289476426B9B70229Ab40D53";
        let weth = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

        deployer.deploy(
            ArcadeLending,
            originationController,
            loanCore,
            repaymentController,
            weth
        );
    }
};
