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

contract ERC20WrongFee is PTest {
    TestAzuki internal nft;
    DemoETH internal token;
    WasabiFeeManager oldFeeManager;
    WasabiFeeManager feeManager;
    WasabiConduit conduit;
    WasabiPoolFactory internal oldPoolFactory;
    WasabiPoolFactory internal poolFactory;
    WasabiOption internal options;
    ETHWasabiPool internal templatePool;
    ERC20WasabiPool internal templateERC20Pool;
    ERC20WasabiPool internal pool;
    uint256 tokenId;

    address internal user;
    address internal agent;
    address internal feeRecipient;
    uint256 internal constant AGENT_KEY = 0x12345678;

    struct LogInfo {
        uint256 expected;
        uint256 paid;
    }

    LogInfo[] pnmLogs;

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
        feeRecipient = makeAddr("feeRecipient");

        token = new DemoETH();
        deal(address(token), user, 100);
        token.issue(user, 100);

        oldFeeManager = new WasabiFeeManager(20, 1000);
        oldFeeManager.setReceiver(feeRecipient);
        oldFeeManager.setFraction(50);
        oldFeeManager.setDenominator(100);

        feeManager = new WasabiFeeManager(20, 1000);
        feeManager.setReceiver(feeRecipient);
        feeManager.setFraction(10);
        feeManager.setDenominator(100);

        options = new WasabiOption();
        conduit = new WasabiConduit(options);

        templatePool = new ETHWasabiPool();
        templateERC20Pool = new ERC20WasabiPool();

        oldPoolFactory = new WasabiPoolFactory(
            options,
            templatePool,
            templateERC20Pool,
            address(oldFeeManager),
            address(conduit)
        );

        poolFactory = new WasabiPoolFactory(
            options,
            templatePool,
            templateERC20Pool,
            address(feeManager),
            address(conduit)
        );

        options.toggleFactory(address(oldPoolFactory), true);
        options.toggleFactory(address(poolFactory), true);

        nft = new TestAzuki();
        tokenId = nft.mint(agent);
        vm.startPrank(agent);
        nft.setApprovalForAll(address(poolFactory), true);
        vm.stopPrank();

        uint256[] memory tokenIds = new uint256[](1);
        tokenIds[0] = tokenId;

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

        pool.writeOption(poolAsk, signature);
    }

    function actionWriteOptionUser(uint256 id) public {
        vm.startPrank(user);
        token.approve(address(pool), type(uint256).max);

        uint256 balanceBefore = token.balanceOf(user);
        // console.log("before", token.balanceOf(user));

        writeOption(
            id,
            address(pool),
            WasabiStructs.OptionType.CALL,
            50, // strike
            50, // premium
            block.timestamp + 10 days,
            tokenId,
            block.timestamp + 10 days
        );

        // console.log("after", token.balanceOf(user));
        // check for maxFee
        uint expected = (balanceBefore * 50) / 100;
        if (expected > (50 / 10)) {
            expected = 50 / 10;
        }

        pnmLogs.push(
            LogInfo(expected + 50, balanceBefore - token.balanceOf(user))
        );

        vm.stopPrank();
    }

    function invariantWrongFee() public {
        for (uint i = 0; i < pnmLogs.length; ++i) {
            require(
                pnmLogs[i].expected == pnmLogs[i].paid,
                "Wrong premium sent"
            );
        }

        delete pnmLogs;
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
