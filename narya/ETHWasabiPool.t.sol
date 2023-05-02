// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.17;

import "../contracts/mocks/DemoETH.sol";
import "../contracts/mocks/TestAzuki.sol";
import "../contracts/WasabiPoolFactory.sol";
import "../contracts/pools/ETHWasabiPool.sol";
import "../contracts/pools/ERC20WasabiPool.sol";
import {WasabiFeeManager} from "../contracts/fees/WasabiFeeManager.sol";
import {WasabiConduit} from "../contracts/conduit/WasabiConduit.sol";

import {PTest} from "@narya-ai/contracts/PTest.sol";

contract ETHWasabiPoolTest is PTest {
    TestAzuki internal nft;
    WasabiFeeManager feeManager;
    WasabiConduit conduit;
    WasabiPoolFactory internal poolFactory;
    WasabiOption internal options;
    ETHWasabiPool internal templatePool;
    ERC20WasabiPool internal templateERC20Pool;
    ETHWasabiPool internal pool;

    uint256 internal nftId0;
    uint256 internal nftId1;
    uint256 internal nftId2;

    address internal user;
    address internal agent;
    uint256 internal constant AGENT_KEY = 0x12345678;

    bytes32 constant EIP712DOMAIN_TYPEHASH =
        keccak256(
            "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
        );
    bytes32 constant POOLASK_TYPEHASH =
        keccak256(
            "PoolAsk(uint256 id,address poolAddress,uint8 optionType,uint256 strikePrice,uint256 premium,uint256 expiry,uint256 tokenId,uint256 orderExpiry)"
        );

    function setUp() public {
        user = makeAddr("User");
        agent = vm.addr(AGENT_KEY);

        feeManager = new WasabiFeeManager(20, 1000);
        options = new WasabiOption();
        conduit = new WasabiConduit(options);

        templatePool = new ETHWasabiPool();
        templateERC20Pool = new ERC20WasabiPool();
        poolFactory = new WasabiPoolFactory(
            options,
            templatePool,
            templateERC20Pool,
            address(feeManager),
            address(conduit)
        );
        options.toggleFactory(address(poolFactory), true);

        nft = new TestAzuki();
        nftId0 = nft.mint(agent);
        nftId1 = nft.mint(agent);
        nftId2 = nft.mint(agent);

        vm.startPrank(agent);
        nft.setApprovalForAll(address(poolFactory), true);
        vm.stopPrank();

        uint256[] memory tokenIds = new uint256[](3);
        tokenIds[0] = nftId0;
        tokenIds[1] = nftId1;
        tokenIds[2] = nftId2;

        vm.startPrank(agent);
        address poolAddress = poolFactory.createPool(
            address(nft),
            tokenIds, // 3 NFTs
            address(0)
        );
        pool = ETHWasabiPool(payable(poolAddress));
        vm.stopPrank();
    }

    function testWriteOption(
        uint256 id,
        uint256 eth_amount,
        uint256 premium
    ) public {
        vm.assume(id > 0 && id <= nftId2);
        vm.assume(eth_amount >= premium && premium > 0 && premium < 1e28);
        deal(user, eth_amount);

        vm.startPrank(user);
        writeOption(
            id,
            address(pool),
            WasabiStructs.OptionType.CALL,
            10, // strike price
            premium, // premium
            block.timestamp + 10 days,
            nftId0,
            block.timestamp + 10 days
        );
        (, uint256 fee) = feeManager.getFeeData(address(this), premium);
        vm.stopPrank();
        require(user.balance == eth_amount - premium - fee, "incorrect ETH balance");
    }

    function writeOption(
        uint256 id,
        address poolAddress,
        WasabiStructs.OptionType optionType,
        uint256 strikePrice,
        uint256 premium,
        uint256 expiry,
        uint256 tokenId, // Tokens to deposit for CALL options
        uint256 orderExpiry
    ) private {
        WasabiStructs.PoolAsk memory poolAsk = WasabiStructs.PoolAsk(
            id,
            poolAddress,
            optionType,
            strikePrice,
            premium,
            expiry,
            tokenId, // Tokens to deposit for CALL options
            orderExpiry
        );

        bytes32 domainSeparator = hashDomain(
            WasabiStructs.EIP712Domain({
                name: "PoolAskSignature",
                version: "1",
                chainId: getChainID(),
                verifyingContract: address(pool)
            })
        );

        // hash of message
        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                domainSeparator,
                hashForPoolAsk(poolAsk)
            )
        );

        // get signature
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(AGENT_KEY, digest);
        bytes memory signature = abi.encodePacked(r, s, v);

        (, uint256 fee) = feeManager.getFeeData(address(this), premium);
        pool.writeOption{value: premium + fee}(poolAsk, signature);
    }

    //////////////////////
    // utility functions
    ////////////////////

    function hashDomain(
        WasabiStructs.EIP712Domain memory _eip712Domain
    ) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    EIP712DOMAIN_TYPEHASH,
                    keccak256(bytes(_eip712Domain.name)),
                    keccak256(bytes(_eip712Domain.version)),
                    _eip712Domain.chainId,
                    _eip712Domain.verifyingContract
                )
            );
    }

    function getChainID() internal view returns (uint256) {
        uint256 id;
        assembly {
            id := chainid()
        }
        return id;
    }

    function hashForPoolAsk(
        WasabiStructs.PoolAsk memory _poolAsk
    ) public pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    POOLASK_TYPEHASH,
                    _poolAsk.id,
                    _poolAsk.poolAddress,
                    _poolAsk.optionType,
                    _poolAsk.strikePrice,
                    _poolAsk.premium,
                    _poolAsk.expiry,
                    _poolAsk.tokenId,
                    _poolAsk.orderExpiry
                )
            );
    }
    receive() external payable virtual {}
}
