// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.17;

import "../../contracts/mocks/DemoETH.sol";
import "../../contracts/mocks/TestAzuki.sol";
import "../../contracts/WasabiPoolFactory.sol";
import "../../contracts/pools/ETHWasabiPool.sol";
import "../../contracts/pools/ERC20WasabiPool.sol";

import "@pwnednomore/contracts/PTest.sol";

contract ERC20WasabiPoolTest is PTest {
    TestAzuki internal nft;
    DemoETH internal token;
    WasabiPoolFactory internal poolFactory;
    WasabiOption internal options;
    ETHWasabiPool internal templatePool;
    ERC20WasabiPool internal templateERC20Pool;
    ERC20WasabiPool internal pool;

    uint256 internal nftId0;
    uint256 internal nftId1;
    uint256 internal nftId2;

    address internal user;
    address internal agent;
    uint256 internal constant AGENT_KEY = 0x12345678;

    function setUp() public {
        user = makeAddr("User");
        agent = vm.addr(AGENT_KEY);

        token = new DemoETH();
        deal(address(token), user, 100);

        options = new WasabiOption();
        templatePool = new ETHWasabiPool();
        templateERC20Pool = new ERC20WasabiPool();
        poolFactory = new WasabiPoolFactory(
            options,
            templatePool,
            templateERC20Pool
        );
        options.setFactory(address(poolFactory));

        nft = new TestAzuki();
        nftId0 = nft.mint(agent);
        nftId1 = nft.mint(agent);
        nftId2 = nft.mint(agent);

        vm.startPrank(agent);
        nft.setApprovalForAll(address(poolFactory), true);
        vm.stopPrank();

        WasabiStructs.PoolConfiguration memory poolConfiguration = WasabiStructs
            .PoolConfiguration(1, 100, 1, 30 days);

        WasabiStructs.OptionType[]
            memory types = new WasabiStructs.OptionType[](1);
        types[0] = WasabiStructs.OptionType.CALL;
        // types[1] = WasabiStructs.OptionType.PUT;

        uint256[] memory tokenIds = new uint256[](3);
        tokenIds[0] = nftId0;
        tokenIds[1] = nftId1;
        tokenIds[2] = nftId2;

        vm.startPrank(agent);
        address poolAddress = poolFactory.createERC20Pool(
            address(token),
            0,
            address(nft),
            tokenIds, // 3 NFTs
            poolConfiguration,
            types,
            address(0)
        );
        pool = ERC20WasabiPool(payable(poolAddress));
        vm.stopPrank();

        vm.startPrank(user);
        token.approve(address(pool), type(uint256).max);
        writeOption(
            address(pool),
            WasabiStructs.OptionType.CALL,
            10, // strike price
            1, // premium
            30 days,
            nftId0,
            block.number + 5
        );
        vm.stopPrank();
    }

    function invariantLockedNft() public view {
        uint256 userNftBalance = nft.balanceOf(user);
        uint256 poolNftBalance = nft.balanceOf(address(pool));

        require(
            (userNftBalance == 1 && poolNftBalance == 2) || // either option executed
                (userNftBalance == 0 && poolNftBalance == 3), // or option not executed
            "invalid nft balance"
        );
    }

    function actionExecuteOption(uint256 optionId) public {
        vm.startPrank(user);
        pool.executeOption(optionId);
        vm.stopPrank();
    }

    function writeOption(
        address poolAddress,
        WasabiStructs.OptionType optionType,
        uint256 strikePrice,
        uint256 premium,
        uint256 duration,
        uint256 tokenId, // Tokens to deposit for CALL options
        uint256 maxBlockToExecute
    ) private {
        WasabiStructs.OptionRequest memory request = WasabiStructs
            .OptionRequest(
                poolAddress,
                optionType,
                strikePrice,
                premium,
                duration,
                tokenId, // Tokens to deposit for CALL options
                maxBlockToExecute
            );

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(
            AGENT_KEY,
            Signing.getEthSignedMessageHash(Signing.getMessageHash(request))
        );
        bytes memory signature = abi.encodePacked(r, s, v);

        pool.writeOption(request, signature);
    }
}
