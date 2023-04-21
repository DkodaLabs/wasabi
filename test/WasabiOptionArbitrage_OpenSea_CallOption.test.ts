import { Interface } from "@ethersproject/abi";
import { ethers } from 'hardhat';
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import axios from "axios";
import { BigNumber } from "@ethersproject/bignumber";
import * as Sdk from "@reservoir0x/sdk";
import { Contract } from "@ethersproject/contracts";
import { BigNumberish } from "@ethersproject/bignumber";
import { makeConfigs } from "./util/TestUtils";
import { PoolAsk, OptionType, ZERO_ADDRESS } from "./util/TestTypes";
import { signPoolAsk , makeRequests } from "./util/TestUtils";
import { parseEther, parseUnits } from "@ethersproject/units";
import * as seaportV14 from "./seaport-v1.4";
import { expect } from "chai";
import {
  setupNFTs,
} from "./utils";

describe("[ReservoirV6_0_1] OpenSea Call Option", () => {

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
  let wasabiValidation: Contract;
  let ethPool: Contract;
  let erc20Pool: Contract;
  let feeManager: Contract;
  let conduit: Contract;
  let poolAskVerifier: Contract;
  let poolBidVerifier: Contract;
  let sign: Contract;

  let request: PoolAsk;

  let router: Contract;
  let seaportV14Module: Contract;
  let chainId = 1;

  let erc721: Contract;

  beforeEach(async () => {
    [deployer, alice, bob, carol, david, emilio] = await ethers.getSigners();

    erc721 = await setupNFTs(deployer);

    router = await ethers
      .getContractFactory("ReservoirV6_0_1", deployer)
      .then((factory) => factory.deploy());

    seaportV14Module = await ethers
      .getContractFactory("SeaportV14Module", deployer)
      .then((factory) =>
        factory.deploy(deployer.address, router.address, Sdk.SeaportV14.Addresses.Exchange[chainId])
      );
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

    wasabiValidation = await ethers.getContractFactory("WasabiValidation", deployer)
    .then((factory) => factory.deploy());

    ethPool = await ethers.getContractFactory("ETHWasabiPool", {
      libraries: {
        PoolAskVerifier: poolAskVerifier.address,
        PoolBidVerifier: poolBidVerifier.address,
        WasabiValidation: wasabiValidation.address
      }
    }, deployer)
    .then((factory) => factory.deploy());

    erc20Pool = await ethers.getContractFactory("ERC20WasabiPool", {
      libraries: {
        PoolAskVerifier: poolAskVerifier.address,
        PoolBidVerifier: poolBidVerifier.address,
        WasabiValidation: wasabiValidation.address
      }
    }, deployer)
    .then((factory) => factory.deploy());

    feeManager = await ethers.getContractFactory("WasabiFeeManager", deployer)
    .then((factory) => factory.deploy());

    conduit = await ethers.getContractFactory("WasabiConduit", {
      libraries: {
        Signing: sign.address
      }
    }, deployer)
    .then((factory) => factory.deploy());;


    option = await ethers
    .getContractFactory("WasabiOption", deployer)
    .then((factory) => factory.deploy());


    poolFactory = await ethers.getContractFactory("WasabiPoolFactory", {
      libraries:{
        WasabiValidation: wasabiValidation.address
      }
    }).then((factory) => factory.deploy(option.address, ethPool.address, erc20Pool.address,
      feeManager.address, conduit.address));

    await option.toggleFactory(poolFactory.address, true);


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
      };
    }
  };

  const testAcceptOffers = async (
    offersCount: number
  ) => {
    // Setup

    // Makers: Alice and Bob
    // Taker: Carol
    // Fee recipient: Emilio

    const paymentToken = Sdk.Common.Addresses.Eth[chainId];
    const offers: seaportV14.Offer[] = [];
    const fees: BigNumber[] = [];
    for (let i = 0; i < offersCount; i++) {
      offers.push({
        buyer: bob,
        nft: {
          kind: "erc721", contract: erc721 ,
          id: 1001,
        },
        price: parseEther("40"),
        fees: [
          {
            recipient: david.address,
            amount: parseEther("0.1")
          }
        ],
        isCancelled: false,
      });

    }
    await seaportV14.setupOffers(offers);
    // Send the NFTs to the module (in real-world this will be done atomically)
    for (const offer of offers) {
      await offer.nft.contract.connect(carol).mint();
      await offer.nft.contract.connect(carol).setApprovalForAll(poolFactory.address, true);
    }
    const createPoolResult =
    await poolFactory.connect(carol).createPool(
      erc721.address,
        [1001],
        makeConfigs(parseEther("1").toString(), parseEther("100").toString(), 222, 2630000 /* one month */),
        [OptionType.CALL],
        ZERO_ADDRESS,
        {value: parseEther("30")});
    let receipt = await createPoolResult.wait();

    const poolAddress = receipt.events[0].args[0];

    const pool = ethPool.attach(poolAddress);

    const id = 1;
    let blockNumber = await ethers.provider.getBlock("latest");
    let expiry = blockNumber.timestamp + 10000;
    let orderExpiry = blockNumber.timestamp + 10000;

    request = makeRequests(id, poolAddress, OptionType.CALL, parseEther("30"), parseEther("0.5"), expiry, 1001, orderExpiry); // no strike price in request

    const chainID = (await ethers.provider.getNetwork()).chainId;

    const signature = await signPoolAsk(request, poolAddress, carol, Number(chainID));
    const writeOptionResult = await pool.connect(alice).writeOption(request, signature, { value: request.premium });
    let optionReceipt = await writeOptionResult.wait();

    const optionId = optionReceipt.events[1].args[0];

    // Prepare executions
    const executions: ExecutionInfo[] = [
      // 1. Fill offers with the received NFTs
      ...offers.map((offer, i) => ({
        module: seaportV14Module.address,
        data: seaportV14Module.interface.encodeFunctionData("acceptERC721Offer", [
          {
            parameters: {
              ...offer.order!.params,
              totalOriginalConsiderationItems: offer.order!.params.consideration.length,
            },
            numerator: 1,
            denominator: 1,
            signature: offer.order!.params.signature,
            extraData: "0x",
          },
          [],
          {
            fillTo: arbitrage.address,
            refundTo: arbitrage.address,
            revertIfIncomplete: true,
          },
          [{
              recipient: emilio.address,
              amount:"0",
            }
          ],
        ]),
        value: 0,
      })),
    ];

    // Fetch pre-state

    const balancesBefore = await getBalances(paymentToken);

    // Execute Put Option

    await option.connect(alice).approve(arbitrage.address, optionId);

    await arbitrage.connect(alice).arbitrage(optionId, request.strikePrice, poolAddress, executions);
    
    const balancesAfter = await getBalances(paymentToken);
    // Checks

    const strikePrice = BigNumber.from(request.strikePrice);
    expect(balancesAfter.alice.sub(balancesBefore.alice).add(strikePrice)).to.be.closeTo(offers[0].price, parseEther("1"));
  };

  // Test various combinations for filling listings
  it("Test Accept Offer",
    async () =>
      testAcceptOffers(1)
  )

});

