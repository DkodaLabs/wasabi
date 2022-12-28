const TestPudgyPenguins = artifacts.require("TestPudgyPenguins");
const TestInvisibleFriends = artifacts.require("TestInvisibleFriends");
const TestMoonbirds = artifacts.require("TestMoonbirds");
const TestRektGuy = artifacts.require("TestRektGuy");
const TestBoredApes = artifacts.require("TestBoredApes");
const TestERC721 = artifacts.require("TestERC721");

module.exports = function (deployer, _network, accounts) {
  deployer.deploy(TestERC721);
  deployer.deploy(TestPudgyPenguins);
  deployer.deploy(TestInvisibleFriends);
  deployer.deploy(TestMoonbirds);
  deployer.deploy(TestRektGuy);
  deployer.deploy(TestBoredApes);
};