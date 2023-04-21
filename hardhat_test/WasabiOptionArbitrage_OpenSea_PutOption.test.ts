import { ethers } from 'hardhat';
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { BigNumber } from "@ethersproject/bignumber";
import * as Sdk from "@reservoir0x/sdk";
import { Contract } from "@ethersproject/contracts";
import { BigNumberish } from "@ethersproject/bignumber";
import { PoolAsk, OptionType, ZERO_ADDRESS } from "../test/util/TestTypes";
import { signPoolAsk , makeRequests } from "../test/util/TestUtils";
import { parseEther } from "@ethersproject/units";
import * as seaportV14 from "./seaport-v1.4";
import { expect } from "chai";
import {
  bn,
  setupConduit,
  setupNFTs,
} from "./utils";

describe("[ReservoirV6_0_1] OpenSea Put Option", () => {

  type ExecutionInfo = {
    module: string;
    data: string;
    value: BigNumberish;
  };
  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;
  let david: SignerWithAddress;
  let emilio: SignerWithAddress;

  let arbitrage: Contract;
  let poolFactory: Contract;
  let option: Contract;
  let ethPool: Contract;
  let erc20Pool: Contract;
  let feeManager: Contract;
  let conduit: Contract;
  let poolAskVerifier: Contract;
  let poolBidVerifier: Contract;
  let sign: Contract;

  let request: PoolAsk;

  let router: Contract;
  let approvalProxy: Contract;
  let seaportV14Module: Contract;
  let swapModule: Contract;
  let chainId = 1;
  let conduitKey: string;

  let erc721: Contract;


  beforeEach(async () => {
    [deployer, alice, bob, carol, david, emilio] = await ethers.getSigners();

    erc721 = await setupNFTs(deployer);


    router = await ethers
      .getContractFactory("ReservoirV6_0_1", deployer)
      .then((factory) => factory.deploy());

    approvalProxy = await ethers
      .getContractFactory("ReservoirApprovalProxy", deployer)
      .then((factory) =>
        factory.deploy(Sdk.SeaportBase.Addresses.ConduitController[chainId], router.address)
      );
      
      seaportV14Module = await ethers
      .getContractFactory("SeaportV14Module", deployer)
      .then((factory) =>
        factory.deploy(deployer.address, router.address, Sdk.SeaportV14.Addresses.Exchange[chainId])
      );
    swapModule = await ethers
      .getContractFactory("SwapModule", deployer)
      .then((factory) =>
        factory.deploy(
          deployer.address,
          router.address,
          Sdk.Common.Addresses.Weth[chainId],
          Sdk.Common.Addresses.SwapRouter[chainId]
        )
      );

    conduitKey = await setupConduit(chainId, deployer, [approvalProxy.address]);

    // Libraries
    sign = await ethers
    .getContractFactory("Signing", deployer)
    .then((factory)=> factory.deploy());

    poolAskVerifier = await ethers.getContractFactory("PoolAskVerifier", {
      libraries: {
        Signing: sign.address
      }
    }, deployer)
    .then((factory) => factory.deploy());

    poolBidVerifier = await ethers.getContractFactory("PoolBidVerifier", {
      libraries: {
        Signing: sign.address
      }
    }, deployer)
    .then((factory) => factory.deploy());

    ethPool = await ethers.getContractFactory("ETHWasabiPool", {
      libraries: {
        PoolAskVerifier: poolAskVerifier.address,
        PoolBidVerifier: poolBidVerifier.address
      }
    }, deployer)
    .then((factory) => factory.deploy());

    erc20Pool = await ethers.getContractFactory("ERC20WasabiPool", {
      libraries: {
        PoolAskVerifier: poolAskVerifier.address,
        PoolBidVerifier: poolBidVerifier.address,
      }
    }, deployer)
    .then((factory) => factory.deploy());

    feeManager = await ethers.getContractFactory("WasabiFeeManager", deployer)
    .then((factory) => factory.deploy(0, 10000));

    option = await ethers
    .getContractFactory("WasabiOption", deployer)
    .then((factory) => factory.deploy());

    conduit = await ethers.getContractFactory("WasabiConduit", {
      libraries: {
        Signing: sign.address
      }
    }, deployer)
    .then((factory) => factory.deploy(option.address));;

    poolFactory = await ethers.getContractFactory("WasabiPoolFactory", deployer)
      .then((factory) => factory.deploy(option.address, ethPool.address, erc20Pool.address,
      feeManager.address, conduit.address));

    await option.connect(deployer).toggleFactory(poolFactory.address, true);

    const marketAddress = "0xC2c862322E9c97D6244a3506655DA95F05246Fd8";
    const addressProvider = "0x2f39d218133AFaB8F2B819B1066c7E434Ad94E9e"; // for Aave

    arbitrage = await ethers
      .getContractFactory("WasabiOptionArbitrage")
      .then((factory) => factory.deploy(option.address, addressProvider, marketAddress));
  });

  const getBalances = async (token: string) => {
    if (token === Sdk.Common.Addresses.Eth[chainId]) {
      return {
        alice: await ethers.provider.getBalance(alice.address),
        bob: await ethers.provider.getBalance(bob.address),
        carol: await ethers.provider.getBalance(carol.address),
        david: await ethers.provider.getBalance(david.address),
        emilio: await ethers.provider.getBalance(emilio.address),
        router: await ethers.provider.getBalance(router.address),
        seaportV14Module: await ethers.provider.getBalance(seaportV14Module.address),
        swapModule: await ethers.provider.getBalance(swapModule.address),
      };
    } else {
      const contract = new Sdk.Common.Helpers.Erc20(ethers.provider, token);
      return {
        alice: await contract.getBalance(alice.address),
        bob: await contract.getBalance(bob.address),
        carol: await contract.getBalance(carol.address),
        david: await contract.getBalance(david.address),
        emilio: await contract.getBalance(emilio.address),
        router: await contract.getBalance(router.address),
        seaportV14Module: await contract.getBalance(seaportV14Module.address),
        swapModule: await contract.getBalance(swapModule.address),
      };
    }
  };

  const testAcceptListings = async (
    listingsCount: number
  ) => {
    // Setup

    // Makers: Alice and Bob
    // Taker: Carol
    // Fee recipient: Emilio

    const paymentToken = Sdk.Common.Addresses.Eth[chainId];
    const parsePrice = (price: string) => parseEther(price);

    const listings: seaportV14.Listing[] = [];
    const feesOnTop: BigNumber[] = [];
    for (let i = 0; i < listingsCount; i++) {
      listings.push({
        seller: bob,
        nft: {
          kind: "erc721", contract: erc721 ,
          id: 1001,
        },
        paymentToken,
        price: parsePrice("30"),
        isCancelled: false,
      });
    }
    await seaportV14.setupListings(listings);

    const createPoolResult =
    await poolFactory.connect(bob).createPool(
      erc721.address,
        [],
        ZERO_ADDRESS,
        {value: parseEther("40")});

    let receipt = await createPoolResult.wait();

    const poolAddress = receipt.events[0].args[0];

    const pool = ethPool.attach(poolAddress);

    const id = 1;
    let blockNumber = await ethers.provider.getBlock("latest");
    let expiry = blockNumber.timestamp + 10000;
    let orderExpiry = blockNumber.timestamp + 10000;

    request = makeRequests(id, poolAddress, OptionType.PUT, parseEther("40"), parseEther("0.5"), expiry, 1001, orderExpiry); // no strike price in request

    const chainID = (await ethers.provider.getNetwork()).chainId;

    const signature = await signPoolAsk(request, poolAddress, bob, Number(chainID));
    const writeOptionResult = await pool.connect(carol).writeOption(request, signature, { value: request.premium });
    let optionReceipt = await writeOptionResult.wait();

    const optionId = optionReceipt.events[1].args[0];

    // Prepare executions

    const totalPrice = bn(listings.map(({ price }) => price).reduce((a, b) => bn(a).add(b), bn(0)));
    const executions: ExecutionInfo[] = [{
      // 2. Fill listings
            module: seaportV14Module.address,
            data: seaportV14Module.interface.encodeFunctionData(
              `acceptETHListing`,
              [
                ...listings.map((listing) => ({
                  parameters: {
                    ...listing.order!.params,
                    totalOriginalConsiderationItems: listing.order!.params.consideration.length,
                  },
                  numerator: 1,
                  denominator: 1,
                  signature: listing.order!.params.signature,
                  extraData: "0x",
                })),
                {
                  fillTo: arbitrage.address,
                  refundTo: arbitrage.address,
                  revertIfIncomplete: true,
                  amount: totalPrice,
                  // Only relevant when filling USDC listings
                  token: paymentToken,
                },
                [
                  ...feesOnTop.map((amount) => ({
                    recipient: emilio.address,
                    amount,
                  })),
                ],
              ]
            ),
            value: totalPrice,
        }
    ];

    // Fetch pre-state

    const balancesBefore = await getBalances(paymentToken);

    // Execute Put Option

    await option.connect(carol).setApprovalForAll(arbitrage.address, true);
    await arbitrage.connect(carol).arbitrage(optionId, totalPrice, poolAddress, executions);
    

    // // Fetch post-state

    const balancesAfter = await getBalances(paymentToken);

    // Checks

    // Alice got the payment
    expect(balancesAfter.carol.sub(balancesBefore.carol).add(listings[0].price)).to.be.closeTo(request.strikePrice, parseEther("1"));
  };

  // Test various combinations for filling listings
  it("Test Accept Listing",
    async () =>
      testAcceptListings(1)
  )

});

