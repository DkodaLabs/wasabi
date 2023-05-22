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

contract ERC20AcceptPoolBid is PTest {
    TestAzuki internal nft;
    DemoETH internal token;
    WasabiFeeManager feeManager;
    WasabiConduit conduit;
    WasabiPoolFactory internal poolFactory;
    WasabiOption internal options;
    ETHWasabiPool internal templatePool;
    ERC20WasabiPool internal templateERC20Pool;
    ERC20WasabiPool internal pool;
    uint256 tokenId;
    uint256 tokenId2;
    uint256 optionId;
    uint256 optionId2;

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

    bytes32 constant POOLBID_TYPEHASH =
        keccak256(
            "PoolBid(uint256 id,uint256 price,address tokenAddress,uint256 orderExpiry,uint256 optionId)"
        );

    function setUp() public {
        user = makeAddr("User");
        agent = vm.addr(AGENT_KEY);

        token = new DemoETH();
        deal(address(token), user, 100);
        token.issue(agent, 100);

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
        tokenId = nft.mint(agent);
        tokenId2 = nft.mint(agent);
        vm.startPrank(agent);
        nft.setApprovalForAll(address(poolFactory), true);
        vm.stopPrank();

        uint256[] memory tokenIds = new uint256[](2);
        tokenIds[0] = tokenId;
        tokenIds[1] = tokenId2;

        vm.startPrank(agent);
        address poolAddress = poolFactory.createERC20Pool(
            address(token),
            0,
            address(nft),
            tokenIds,
            address(0)
        );
        pool = ERC20WasabiPool(payable(poolAddress));
        vm.stopPrank();

        require(pool.owner() == agent);

        // user get some options

        vm.startPrank(user);
        token.approve(address(pool), type(uint256).max);
        optionId = writeOption(
            0,
            address(pool),
            WasabiStructs.OptionType.CALL,
            10, // strike price
            1, // premium
            block.timestamp + 10 days,
            tokenId,
            block.timestamp + 10 days
        );

        optionId2 = writeOption(
            1,
            address(pool),
            WasabiStructs.OptionType.CALL,
            10, // strike price
            1, // premium
            block.timestamp + 10 days,
            tokenId2,
            block.timestamp + 10 days
        );
        vm.stopPrank();
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
    ) private returns (uint256) {
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

        return pool.writeOption(poolAsk, signature);
    }

    function acceptPoolBid(
        uint256 id,
        uint256 price,
        address tokenAddress,
        uint256 orderExpiry,
        uint256 optionId_
    ) private {
        WasabiStructs.PoolBid memory poolBid = WasabiStructs.PoolBid(
            id,
            price,
            tokenAddress,
            orderExpiry,
            optionId_
        );

        bytes32 domainSeparator = hashDomain(
            WasabiStructs.EIP712Domain({
                name: "PoolBidVerifier",
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
                hashForPoolBid(poolBid)
            )
        );

        // get signature
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(AGENT_KEY, digest);
        bytes memory signature = abi.encodePacked(r, s, v);

        pool.acceptPoolBid(poolBid, signature);
    }

    function invariantUncheckedPrice() public {
        if (nft.balanceOf(address(pool)) > 0) {
            require(
                token.balanceOf(address(pool)) > 0,
                "pool drained while NFTs are still left"
            );
        }
    }

    function actionAcceptPoolBidUsingLiquidity(
        uint256 id,
        uint256 amount
    ) public {
        vm.assume(amount <= 2);

        vm.startPrank(user);

        acceptPoolBid(
            id,
            amount,
            address(token),
            block.timestamp + 10 days,
            optionId
        );

        vm.stopPrank();
    }

    // function testAcceptPoolBidArbitraryToken(
    //     uint256 id,
    //     uint256 amount
    // ) public {
    //     vm.assume(amount <= 2);

    //     vm.startPrank(user);

    //     acceptPoolBid(
    //         id,
    //         amount,
    //         address(this),
    //         block.timestamp + 10 days,
    //         optionId
    //     );

    //     vm.stopPrank();
    // }

    ////////////////
    // Fake ERC20
    ////////////////

    // serve as other types of invariants
    // function balanceOf(address) public returns(uint256) {
    //     require(false, "arbitrary ERC20 call");
    // }

    // function transfer(address, uint256) public returns(bool) {
    //     require(false, "arbitrary ERC20 call");
    // }

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

    function hashForPoolBid(
        WasabiStructs.PoolBid memory _poolBid
    ) public pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    POOLBID_TYPEHASH,
                    _poolBid.id,
                    _poolBid.price,
                    _poolBid.tokenAddress,
                    _poolBid.orderExpiry,
                    _poolBid.optionId
                )
            );
    }
}
