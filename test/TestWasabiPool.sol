pragma solidity >=0.4.25 <0.9.0;

import "../contracts/WasabiPool.sol";
import "truffle/Assert.sol";
import "truffle/DeployedAddresses.sol";

contract TestWasabiPool {
  function testInitialBalanceUsingDeployedContract() public {
    // WasabiPool pool = WasabiPool(DeployedAddresses.WasabiPool());

    // uint expected = 10000;

    // Assert.equal(pool.availableBalance(), expected, "Owner should have 10000 poolCoin initially");
  }
}