// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.17;

import "../../contracts/mocks/DemoETH.sol";
import "../../contracts/mocks/TestAzuki.sol";
import "../../contracts/WasabiPoolFactory.sol";
import "../../contracts/pools/ETHWasabiPool.sol";
import "../../contracts/pools/ERC20WasabiPool.sol";
import {WasabiFeeManager} from "../../contracts/fees/WasabiFeeManager.sol";
import {WasabiConduit} from "../../contracts/conduit/WasabiConduit.sol";

import "../../lib/narya-contracts/PTest.sol";

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

    function setUp() public {
        owner = vm.addr(OWNER_KEY);
        agent = vm.addr(AGENT_KEY);

        vm.startPrank(owner);

        token = new DemoETH();
        deal(address(token), owner, 100);
        token.issue(agent, 100 ether);
        
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

        options.toggleFactory(address(poolFactory), true);

        nft = new TestAzuki();
        tokenId = nft.mint(owner);
        nft.setApprovalForAll(address(poolFactory), true);

        WasabiStructs.PoolConfiguration memory poolConfiguration = WasabiStructs
            .PoolConfiguration(1, 1000, 1, 30 days);

        WasabiStructs.OptionType[]
            memory types = new WasabiStructs.OptionType[](1);
        types[0] = WasabiStructs.OptionType.CALL;
        // types[1] = WasabiStructs.OptionType.PUT;

        uint256[] memory tokenIds = new uint256[](1);
        tokenIds[0] = tokenId;

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

        require(pool.owner() == owner);
        vm.stopPrank();

        vm.startPrank(agent);
        token.approve(address(pool), type(uint256).max);

        writeOption(
            0,
            address(pool),
            WasabiStructs.OptionType.CALL,
            10, // strike price
            1 ether, // premium
            block.timestamp + 10 days,
            tokenId,
            block.timestamp + 10 days
        );
        vm.stopPrank();
    }

    function invariantPoolOwner() public view {
        require(
            pool.owner() == owner,
            "pool owner changed"
        );
    }

    function invariantPoolFactoryOwner() public view {
        require(
            poolFactory.owner() == owner,
            "poolFactory owner changed"
        );
    }

    function invariantWasabiOptionOwner() public view {
        require(
            options.owner() == owner,
            "WasabiOption owner changed"
        );
    }

    function invariantConduitOwner() public view {
        require(
            conduit.owner() == owner,
            "conduit owner changed"
        );
    }

    function invariantFeeManagerOwner() public view {
        require(
            feeManager.owner() == owner,
            "feeManager owner changed"
        );
    }

    function actionWriteOption(
        uint256 id,
        address poolAddress,
        WasabiStructs.OptionType optionType,
        uint256 strikePrice,
        uint256 premium,
        uint256 duration,
        uint256 tokenId_, // Tokens to deposit for CALL options
        uint256 maxBlockToExecute
    ) public {
        writeOption(
            id,
            poolAddress,
            optionType,
            strikePrice,
            premium,
            duration,
            tokenId_,
            maxBlockToExecute
        );
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
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(OWNER_KEY, digest);
        bytes memory signature = abi.encodePacked(r, s, v);
        
        pool.writeOption(poolAsk, signature);
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
}
