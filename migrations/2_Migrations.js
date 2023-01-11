const TestPudgyPenguins = artifacts.require("TestPudgyPenguins");
const TestInvisibleFriends = artifacts.require("TestInvisibleFriends");
const TestMoonbirds = artifacts.require("TestMoonbirds");
const TestRektGuy = artifacts.require("TestRektGuy");
const TestBoredApes = artifacts.require("TestBoredApes");
const TestERC721 = artifacts.require("TestERC721");
const TestAzuki = artifacts.require("TestAzuki");
const TestCaptainz = artifacts.require("TestCaptainz");
const TestMutantApes = artifacts.require("TestMutantApes");
const TestMutantHoundCollars = artifacts.require("TestMutantHoundCollars");

module.exports = function (deployer, _network, accounts) {
  deployer.deploy(TestERC721);
  deployer.deploy(TestAzuki);
  deployer.deploy(TestPudgyPenguins);
  deployer.deploy(TestInvisibleFriends);
  deployer.deploy(TestMoonbirds);
  deployer.deploy(TestRektGuy);
  deployer.deploy(TestBoredApes);
  deployer.deploy(TestMutantApes);
  deployer.deploy(TestMutantHoundCollars);
  deployer.deploy(TestCaptainz);
};