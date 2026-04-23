// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import "forge-std/Test.sol";

import {ArbExecutor} from "../src/ArbExecutor.sol";

contract ArbExecutorTest is Test {
    ArbExecutor internal executor;

    function setUp() public {
        executor = new ArbExecutor(
            address(this), address(0x1001), address(0x1002), address(0x1003), address(0x1004), address(0x1005)
        );
    }

    function testExecuteArbRequiresFlashLoan() public {
        ArbExecutor.Call[] memory calls = new ArbExecutor.Call[](1);
        calls[0] = ArbExecutor.Call({target: address(0x2001), value: 0, data: hex"1234"});

        ArbExecutor.FlashParams memory params = ArbExecutor.FlashParams({
            profitToken: address(0x3001),
            minProfit: 1,
            deadline: block.timestamp + 1 hours,
            routeHash: keccak256(abi.encode(calls)),
            calls: calls
        });

        vm.expectRevert(ArbExecutor.FlashLoanRequired.selector);
        executor.executeArb(address(0x4001), 0, params);
    }
}
