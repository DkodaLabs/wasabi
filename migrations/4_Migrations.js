const TestInvisibleFriends = artifacts.require("TestInvisibleFriends");
const TestMoonbirds = artifacts.require("TestMoonbirds");
const TestRektGuy = artifacts.require("TestRektGuy");

module.exports = function (deployer, _network, accounts) {
  deployer.deploy(TestInvisibleFriends);
  deployer.deploy(TestMoonbirds);
  deployer.deploy(TestRektGuy);
};