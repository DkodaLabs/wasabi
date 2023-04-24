// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.17;

import "../contracts/mocks/DemoETH.sol";
import "../contracts/mocks/TestERC721.sol";
import "../contracts/WasabiPoolFactory.sol";
import "../contracts/pools/ETHWasabiPool.sol";
import "../contracts/pools/ERC20WasabiPool.sol";
import {WasabiFeeManager} from "../contracts/fees/WasabiFeeManager.sol";
import {WasabiConduit} from "../contracts/conduit/WasabiConduit.sol";

import {PTest} from "@narya-ai/contracts/PTest.sol";

contract ERC20WasabiPool_AcceptAsk is PTest {
    TestERC721 internal nft;
    DemoETH internal token;
    WasabiFeeManager feeManager;
    WasabiConduit conduit;
    WasabiPoolFactory internal poolFactory;
    WasabiOption internal options;
    ETHWasabiPool internal templatePool;
    ERC20WasabiPool internal templateERC20Pool;
    ERC20WasabiPool internal pool;
    uint256 tokenId;
    uint96 royaltyPayoutPercent = 20;
    uint256 tokenId1;
    uint256 tokenId2;
    uint256 tokenId3;
    uint256 tokenId4;
    uint256 tokenId5;
    uint256 tokenId6;
    uint256 tokenId7;

    uint256 optionId;

    address internal user;
    address internal agent;
    address internal bob;
    uint256 internal constant AGENT_KEY = 0x12345678;
    uint256 internal constant BOB_KEY = 0x87654321;

    bytes32 constant EIP712DOMAIN_TYPEHASH =
        keccak256(
            "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
        );
    bytes32 constant POOLASK_TYPEHASH =
        keccak256(
            "PoolAsk(uint256 id,address poolAddress,uint8 optionType,uint256 strikePrice,uint256 premium,uint256 expiry,uint256 tokenId,uint256 orderExpiry)"
        );
    
    bytes32 constant BID_TYPEHASH =
        keccak256(
            "Bid(uint256 id,uint256 price,address tokenAddress,address collection,uint256 orderExpiry,address buyer,uint8 optionType,uint256 strikePrice,uint256 expiry,uint256 expiryAllowance,address optionTokenAddress)"
        );

    bytes32 constant ASK_TYPEHASH =
        keccak256(
            "Ask(uint256 id,uint256 price,address tokenAddress,uint256 orderExpiry,address seller,uint256 optionId)"
        );

    function setUp() public {
        user = makeAddr("User");
        bob = vm.addr(BOB_KEY);
        agent = vm.addr(AGENT_KEY);

        token = new DemoETH();
        deal(address(token), user, 100);
        token.issue(address(agent), 100 ether);
        token.issue(address(bob), 100 ether);

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

        // feeManager.setFraction(royaltyPayoutPercent);
        options.toggleFactory(address(poolFactory), true);
        conduit.setOption(options);
        conduit.setPoolFactoryAddress(address(poolFactory));

        nft = new TestERC721();
        
        vm.startPrank(agent);
        tokenId1 = nft.mint();
        tokenId2 = nft.mint();
        tokenId3 = nft.mint();
        tokenId4 = nft.mint();
        vm.stopPrank();

        vm.startPrank(user);
        tokenId5 = nft.mint();
        vm.stopPrank();

        vm.startPrank(bob);
        tokenId6 = nft.mint();
        tokenId7 = nft.mint();
        vm.stopPrank();
    }

    function _testCreatePool() public {
        uint256[] memory tokenIds = new uint256[](4);
        tokenIds[0] = tokenId1;
        tokenIds[1] = tokenId2;
        tokenIds[2] = tokenId3;
        tokenIds[3] = tokenId4;

        vm.startPrank(agent);

        nft.setApprovalForAll(address(poolFactory), true);

        address poolAddress = poolFactory.createERC20Pool(
            address(token),
            0,
            address(nft),
            tokenIds,
            agent
        );
        pool = ERC20WasabiPool(payable(poolAddress));
        vm.stopPrank();

        assert(pool.owner() == agent);
        assert(pool.getLiquidityAddress() == address(token));
        assert(nft.balanceOf(address(pool)) == tokenIds.length);

        assert(nft.ownerOf(tokenIds[0]) == address(pool));
        assert(nft.ownerOf(tokenIds[1]) == address(pool));
        assert(nft.ownerOf(tokenIds[2]) == address(pool));
        assert(nft.ownerOf(tokenIds[3]) == address(pool));
    }

    function _testWriteOption() public {
        vm.startPrank(agent);
        uint256 premium = 1 ether;

        token.approve(address(conduit), 10 ether);

        
        optionId = buyOption(
            1,
            address(pool),
            WasabiStructs.OptionType.CALL,
            10,
            premium,
            block.timestamp + 10_000,
            1003,
            block.timestamp + 10_000
        );

        assert(token.balanceOf(address(pool)) == premium);
        assert(options.ownerOf(optionId) == agent);
        assert(pool.getOptionIdForToken(1003) == optionId);

        vm.stopPrank();
    }

    function _testAcceptAsk() public {
        vm.prank(agent);
        options.setApprovalForAll(address(conduit), true);

        uint256 initialBalanceSeller = token.balanceOf(agent);

        (WasabiStructs.Ask memory ask, bytes memory signature) = makeAsk(
            1,
            1 ether, // price
            address(token),
            block.timestamp + 20,
            agent,
            optionId
        );

        vm.prank(agent);
        pool.acceptAsk(ask, signature);

        uint256 finalBalanceSeller = token.balanceOf(agent);

        assert(finalBalanceSeller-initialBalanceSeller == 1 ether);
    }

    function testWriteOption() public {
        _testCreatePool();
        _testWriteOption();
    }

    function testAcceptAsk() public {
        _testCreatePool();
        _testWriteOption();
        _testAcceptAsk();
    }

    function buyOption(
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

        return conduit.buyOption(poolAsk, signature);
    }

    function writeOption(
        uint256 id,
        address poolAddress,
        WasabiStructs.OptionType optionType,
        uint256 strikePrice,
        uint256 premium,
        uint256 expiry,
        uint256 tokenId_, // Tokens to deposit for CALL options
        uint256 orderExpiry
    ) private returns (uint256) {
        WasabiStructs.PoolAsk memory poolAsk = WasabiStructs.PoolAsk(
            id,
            poolAddress,
            optionType,
            strikePrice,
            premium,
            expiry,
            tokenId_, // Tokens to deposit for CALL options
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

    function makeAsk(
        uint256 id,
        uint256 price,
        address tokenAddress,
        uint256 orderExpiry,
        address seller,
        uint256 optionId_
    ) private returns (WasabiStructs.Ask memory ask, bytes memory signature) {
        ask = WasabiStructs.Ask(
            id,
            price,
            tokenAddress,
            orderExpiry,
            seller,
            optionId_
        );

        bytes32 domainSeparator = hashDomain(
            WasabiStructs.EIP712Domain({
                name: "ConduitSignature",
                version: "1",
                chainId: getChainID(),
                verifyingContract: address(conduit)
            })
        );
        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", domainSeparator, hashForAsk(ask))
        );

        // get signature
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(AGENT_KEY, digest);
        signature = abi.encodePacked(r, s, v);
    }

    function acceptAsk(
        uint256 id,
        uint256 price,
        address tokenAddress,
        uint256 orderExpiry,
        address seller,
        uint256 optionId_,
        address prankster
    ) private returns (uint256) {
        WasabiStructs.Ask memory ask = WasabiStructs.Ask(
            id,
            price,
            tokenAddress,
            orderExpiry,
            seller,
            optionId_
        );

        bytes32 domainSeparator = hashDomain(
            WasabiStructs.EIP712Domain({
                name: "ConduitSignature",
                version: "1",
                chainId: getChainID(),
                verifyingContract: address(conduit)
            })
        );
        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", domainSeparator, hashForAsk(ask))
        );

        // get signature
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(AGENT_KEY, digest);
        bytes memory signature = abi.encodePacked(r, s, v);

        vm.prank(prankster);
        return conduit.acceptAsk(ask, signature);
    }

    function acceptBid(
        uint256 id,
        uint256 price,
        address tokenAddress,
        address collection,
        uint256 orderExpiry,
        address buyer,
        WasabiStructs.OptionType optionType,
        uint256 strikePrice,
        uint256 expiry,
        uint256 expiryAllowance,
        address optionTokenAddress,
        uint256 optionId_,
        address prankster
    ) private {
        WasabiStructs.Bid memory bid = WasabiStructs.Bid(
            id,
            price,
            tokenAddress,
            collection,
            orderExpiry,
            buyer,
            optionType,
            strikePrice,
            expiry,
            expiryAllowance,
            optionTokenAddress
        );

        bytes32 domainSeparator = hashDomain(
            WasabiStructs.EIP712Domain({
                name: "ConduitSignature",
                version: "1",
                chainId: getChainID(),
                verifyingContract: address(conduit)
            })
        );
        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", domainSeparator, hashForBid(bid))
        );

        // get signature
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(AGENT_KEY, digest);
        bytes memory signature = abi.encodePacked(r, s, v);

        vm.prank(prankster);
        conduit.acceptBid(optionId_, address(pool), bid, signature);
    }

    function poolAcceptBid(
        uint256 id,
        uint256 price,
        address tokenAddress,
        address collection,
        uint256 orderExpiry,
        address buyer,
        WasabiStructs.OptionType optionType,
        uint256 strikePrice,
        uint256 expiry,
        uint256 expiryAllowance,
        address optionTokenAddress,
        uint256 optionId_,
        address prankster
    ) private {
        WasabiStructs.Bid memory bid = WasabiStructs.Bid(
            id,
            price,
            tokenAddress,
            collection,
            orderExpiry,
            buyer,
            optionType,
            strikePrice,
            expiry,
            expiryAllowance,
            optionTokenAddress
        );

        bytes32 domainSeparator = hashDomain(
            WasabiStructs.EIP712Domain({
                name: "ConduitSignature",
                version: "1",
                chainId: getChainID(),
                verifyingContract: address(conduit)
            })
        );
        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", domainSeparator, hashForBid(bid))
        );

        // get signature
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(AGENT_KEY, digest);
        bytes memory signature = abi.encodePacked(r, s, v);

        vm.prank(prankster);
        conduit.poolAcceptBid(bid, signature, optionId_);
    }

    function cancelAsk(
        uint256 id,
        uint256 price,
        address tokenAddress,
        uint256 orderExpiry,
        address seller,
        uint256 optionId_
    ) private {
        WasabiStructs.Ask memory ask = WasabiStructs.Ask(
            id,
            price,
            tokenAddress,
            orderExpiry,
            seller,
            optionId_
        );

        bytes32 domainSeparator = hashDomain(
            WasabiStructs.EIP712Domain({
                name: "ConduitSignature",
                version: "1",
                chainId: getChainID(),
                verifyingContract: address(conduit)
            })
        );
        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", domainSeparator, hashForAsk(ask))
        );

        // get signature
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(AGENT_KEY, digest);
        bytes memory signature = abi.encodePacked(r, s, v);

        conduit.cancelAsk(ask, signature);
    }

    function cancelBid(
        uint256 id,
        uint256 price,
        address tokenAddress,
        address collection,
        uint256 orderExpiry,
        address buyer,
        WasabiStructs.OptionType optionType,
        uint256 strikePrice,
        uint256 expiry,
        uint256 expiryAllowance,
        address optionTokenAddress,
        uint256 pkey
    ) private {
        WasabiStructs.Bid memory bid = WasabiStructs.Bid(
            id,
            price,
            tokenAddress,
            collection,
            orderExpiry,
            buyer,
            optionType,
            strikePrice,
            expiry,
            expiryAllowance,
            optionTokenAddress
        );

        bytes32 domainSeparator = hashDomain(
            WasabiStructs.EIP712Domain({
                name: "ConduitSignature",
                version: "1",
                chainId: getChainID(),
                verifyingContract: address(conduit)
            })
        );
        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", domainSeparator, hashForBid(bid))
        );

        // get signature
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pkey, digest);
        bytes memory signature = abi.encodePacked(r, s, v);

        conduit.cancelBid(bid, signature);
    }

    ///////////////////
    // utility function
    ///////////////////

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

    function hashForAsk(
        WasabiStructs.Ask memory _ask
    ) public pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    ASK_TYPEHASH,
                    _ask.id,
                    _ask.price,
                    _ask.tokenAddress,
                    _ask.orderExpiry,
                    _ask.seller,
                    _ask.optionId
                )
            );
    }

    function hashForBid(
        WasabiStructs.Bid memory _bid
    ) public pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    BID_TYPEHASH,
                    _bid.id,
                    _bid.price,
                    _bid.tokenAddress,
                    _bid.collection,
                    _bid.orderExpiry,
                    _bid.buyer,
                    _bid.optionType,
                    _bid.strikePrice,
                    _bid.expiry,
                    _bid.expiryAllowance,
                    _bid.optionTokenAddress
                )
            );
    }
}
