// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.17;

import "../../contracts/mocks/DemoETH.sol";
import "../../contracts/mocks/TestAzuki.sol";
import "../../contracts/WasabiPoolFactory.sol";
import "../../contracts/pools/ETHWasabiPool.sol";
import "../../contracts/pools/ERC20WasabiPool.sol";
import {WasabiFeeManager} from "../../contracts/fees/WasabiFeeManager.sol";
import {WasabiConduit} from "../../contracts/conduit/WasabiConduit.sol";

import {PTest} from "@narya-ai/contracts/PTest.sol";

contract ERC20LockedNFT is PTest {
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
    uint256 optionId;

    address internal owner;
    address internal agent;
    uint256 internal constant AGENT_KEY = 0x12345678;
    uint256 internal constant OWNER_KEY = 0x87654321;

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
        owner = vm.addr(OWNER_KEY);
        agent = vm.addr(AGENT_KEY);

        vm.startPrank(owner);

        token = new DemoETH();
        deal(address(token), owner, 100);
        token.issue(agent, 100 ether);
        
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
        tokenId = nft.mint(owner);
        nft.setApprovalForAll(address(poolFactory), true);

        uint256[] memory tokenIds = new uint256[](1);
        tokenIds[0] = tokenId;

        address poolAddress = poolFactory.createERC20Pool(
            address(token),
            0,
            address(nft),
            tokenIds,
            address(0)
        );
        pool = ERC20WasabiPool(payable(poolAddress));

        require(pool.owner() == owner);
        vm.stopPrank();
    }

    function testCancelAsk(
        uint256 id,
        uint256 price,
        address tokenAddress,
        uint256 orderExpiry,
        uint256 optionId_
    ) public {
        vm.startPrank(owner);
        (WasabiStructs.Ask memory ask, bytes memory signature) = makeAsk(
            id,
            price,
            tokenAddress,
            orderExpiry,
            owner,
            optionId_
        );

        conduit.cancelAsk(ask, signature);

        vm.expectRevert();
        conduit.cancelAsk(ask, signature);

        vm.stopPrank();
    }

    function testCancelBid(
        uint256 id,
        uint256 price,
        bool isCall,
        uint256 strikePrice,
        uint256 expiry
    ) public {
        WasabiStructs.OptionType optionType = WasabiStructs.OptionType.PUT;
        if (isCall) {
            optionType = WasabiStructs.OptionType.CALL;
        }

        vm.startPrank(owner);
        (WasabiStructs.Bid memory bid, bytes memory signature) = makeBid(
            id,
            price,
            address(token),
            address(nft),
            expiry,
            owner,
            optionType,
            strikePrice,
            expiry,
            expiry,
            address(token)
        );

        conduit.cancelBid(bid, signature);

        vm.expectRevert();
        conduit.cancelBid(bid, signature);

        
        vm.stopPrank();
    }

    function testSetOption(address option) public {
        vm.prank(owner);
        conduit.setOption(WasabiOption(option));
    }

    function testSetMaxOptionsToBuy(uint256 maxOptionsToBuy) public {
        vm.prank(owner);
        conduit.setMaxOptionsToBuy(maxOptionsToBuy);
    }

    function testSetPoolFactoryAddress(address factory) public {
        vm.prank(owner);
        conduit.setPoolFactoryAddress(factory);
    }

    function makeBid(
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
        address optionTokenAddress
    ) private returns (WasabiStructs.Bid memory bid, bytes memory signature) {
        bid = WasabiStructs.Bid(
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
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(OWNER_KEY, digest);
        signature = abi.encodePacked(r, s, v);
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
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(OWNER_KEY, digest);
        signature = abi.encodePacked(r, s, v);
    }

    function signPoolAsk(
        WasabiStructs.PoolAsk memory poolAsk
    ) private returns (bytes memory signature) {
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
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(OWNER_KEY, digest);
        signature = abi.encodePacked(r, s, v);
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
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(OWNER_KEY, digest);
        signature = abi.encodePacked(r, s, v);
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
