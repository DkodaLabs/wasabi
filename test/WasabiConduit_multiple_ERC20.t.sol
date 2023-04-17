// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.17;

import "../../contracts/mocks/DemoETH.sol";
import "../../contracts/mocks/TestERC721.sol";
import "../../contracts/WasabiPoolFactory.sol";
import "../../contracts/pools/ETHWasabiPool.sol";
import "../../contracts/pools/ERC20WasabiPool.sol";
import {WasabiFeeManager} from "../../contracts/fees/WasabiFeeManager.sol";
import {WasabiConduit} from "../../contracts/conduit/WasabiConduit.sol";

import "../../lib/narya-contracts/PTest.sol";

contract WasabiConduit_multiple_ERC20 is PTest {
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

    uint256[] optionIds;

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

        feeManager = new WasabiFeeManager();
        conduit = new WasabiConduit();

        options = new WasabiOption();
        templatePool = new ETHWasabiPool();
        templateERC20Pool = new ERC20WasabiPool();
        poolFactory = new WasabiPoolFactory(
            options,
            templatePool,
            templateERC20Pool,
            address(feeManager),
            address(conduit)
        );

        feeManager.setFraction(royaltyPayoutPercent);
        options.toggleFactory(address(poolFactory), true);
        conduit.setOption(options);
        conduit.setMaxOptionsToBuy(2);
        conduit.setPoolFactoryAddress(address(poolFactory));

        nft = new TestERC721();
        
        vm.startPrank(agent);
        tokenId1 = nft.mint();
        tokenId2 = nft.mint();
        tokenId3 = nft.mint();
        vm.stopPrank();

        vm.startPrank(bob);
        tokenId4 = nft.mint();
        vm.stopPrank();

        vm.startPrank(user);
        tokenId5 = nft.mint();
        tokenId6 = nft.mint();
        vm.stopPrank();
    }

    function _testCreatePool() public {
        WasabiStructs.PoolConfiguration memory poolConfiguration = WasabiStructs
            .PoolConfiguration(1, 100, 222, 2630000 /* one month */);

        WasabiStructs.OptionType[]
            memory types = new WasabiStructs.OptionType[](1);
        types[0] = WasabiStructs.OptionType.CALL;
        // types[1] = WasabiStructs.OptionType.PUT;

        uint256[] memory tokenIds = new uint256[](3);
        tokenIds[0] = tokenId1;
        tokenIds[1] = tokenId2;
        tokenIds[2] = tokenId3;

        vm.startPrank(agent);

        nft.setApprovalForAll(address(poolFactory), true);

        address poolAddress = poolFactory.createERC20Pool(
            address(token),
            0,
            address(nft),
            tokenIds,
            poolConfiguration,
            types,
            address(0)
        );
        pool = ERC20WasabiPool(payable(poolAddress));
        vm.stopPrank();

        assert(pool.owner() == agent);
        assert(pool.getLiquidityAddress() == address(token));
        uint256[] memory ids = pool.getAllTokenIds();
        assert(ids.length == tokenIds.length);

        assert(ids[0] == 1001);
        assert(ids[1] == 1002);
        assert(ids[2] == 1003);
    }

    function _testWriteOption() public {
        vm.startPrank(agent);
        uint256 premium = 1;

        token.approve(address(conduit), 10 ether);

        (WasabiStructs.PoolAsk memory poolAsk1, bytes memory signature1) = makePoolAsk(
            1,
            address(pool),
            WasabiStructs.OptionType.CALL,
            10,
            premium,
            block.timestamp + 10_000,
            1001,
            block.timestamp + 10_000
        );

        (WasabiStructs.PoolAsk memory poolAsk2, bytes memory signature2) = makePoolAsk(
            2,
            address(pool),
            WasabiStructs.OptionType.CALL,
            10,
            premium,
            block.timestamp + 10_000,
            1002,
            block.timestamp + 10_000
        );

        WasabiStructs.PoolAsk[] memory requests = new WasabiStructs.PoolAsk[](2);
        requests[0] = poolAsk1;
        requests[1] = poolAsk2;

        WasabiStructs.Ask[] memory asks;

        bytes[] memory signatures = new bytes[](2);
        signatures[0] = signature1;
        signatures[1] = signature2;

        optionIds = conduit.buyOptions(
            requests,
            asks,
            signatures
        );

        vm.stopPrank();
    }

    function _testExecuteOption() public {
        vm.startPrank(agent);
        uint256 premium = 1;

        token.approve(address(pool), 10 ether);

        for(uint i = 0; i < optionIds.length; ++i) {
            pool.executeOption(optionIds[i]);
        }            

        assert(nft.ownerOf(1001) == agent);
        assert(nft.ownerOf(1002) == agent);

        vm.stopPrank();
    }

    function _testWithdrawERC721() public {
        
        uint256[] memory ids = new uint256[](1);

        ids[0] = 1001;
        vm.startPrank(agent);
        vm.expectRevert();
        pool.withdrawERC721(nft, ids);
        vm.stopPrank();

        ids[0] = 1003;

        vm.startPrank(bob);
        vm.expectRevert();
        pool.withdrawERC721(nft, ids);
        vm.stopPrank();

        vm.prank(agent);
        pool.withdrawERC721(nft, ids);
    }

    function _testWithdrawETH() public {
        uint value = 1 ether;
        payable(address(pool)).call{value: value}("");
        assert(address(pool).balance >= 1 ether);

        vm.startPrank(bob);
        vm.expectRevert();
        pool.withdrawETH(value);
        vm.stopPrank();

        vm.prank(agent);
        pool.withdrawETH(value);

        assert(address(pool).balance == 0);
    }

    function _testWithdrawERC20() public {
        uint availablePoolBalance = pool.availableBalance();

        vm.startPrank(bob);
        vm.expectRevert();
        pool.withdrawERC20((token), availablePoolBalance);
        vm.stopPrank();

        vm.prank(agent);
        pool.withdrawERC20((token), availablePoolBalance);

        assert(pool.availableBalance() == 0);
    }

    function TestWasabiConduit_multiple_ERC20() public {
        _testCreatePool();
        _testWriteOption();
        _testExecuteOption();
        _testWithdrawERC721();
        _testWithdrawETH();
        _testWithdrawERC20();
    }
    function makePoolAsk(
        uint256 id,
        address poolAddress,
        WasabiStructs.OptionType optionType,
        uint256 strikePrice,
        uint256 premium,
        uint256 expiry,
        uint256 tokenId, // Tokens to deposit for CALL options
        uint256 orderExpiry
    ) private returns (WasabiStructs.PoolAsk memory poolAsk, bytes memory signature) {
        poolAsk = WasabiStructs.PoolAsk(
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
        signature = abi.encodePacked(r, s, v);
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
