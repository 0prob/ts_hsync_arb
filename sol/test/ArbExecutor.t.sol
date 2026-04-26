// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import "forge-std/Test.sol";

import {ArbExecutor} from "../src/ArbExecutor.sol";

contract MockToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }
}

contract MockBalancerVault {
    function flashLoan(
        address recipient,
        MockToken[] memory tokens,
        uint256[] memory amounts,
        bytes memory userData
    ) external {
        uint256 len = tokens.length;
        uint256[] memory fees = new uint256[](len);
        address[] memory tokenAddresses = new address[](len);
        for (uint256 i; i < len;) {
            tokenAddresses[i] = address(tokens[i]);
            tokens[i].transfer(recipient, amounts[i]);
            unchecked {
                ++i;
            }
        }
        (bool ok, bytes memory data) = recipient.call(
            abi.encodeWithSignature(
                "receiveFlashLoan(address[],uint256[],uint256[],bytes)", tokenAddresses, amounts, fees, userData
            )
        );
        if (!ok) {
            assembly {
                revert(add(data, 0x20), mload(data))
            }
        }
    }
}

contract ArbExecutorTest is Test {
    ArbExecutor internal executor;
    MockBalancerVault internal vault;

    function setUp() public {
        vault = new MockBalancerVault();
        executor = new ArbExecutor(
            address(this), address(vault), address(0x1002), address(0x1003), address(0x1004), address(0x1005)
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

    function testExecuteArbFlashLoanCallbackCanRunSelfApprovalCall() public {
        MockToken token = new MockToken();
        token.mint(address(vault), 1_000);

        ArbExecutor.Call[] memory calls = new ArbExecutor.Call[](1);
        calls[0] = ArbExecutor.Call({
            target: address(executor),
            value: 0,
            data: abi.encodeWithSelector(ArbExecutor.approveIfNeeded.selector, address(token), address(0x2001), 1)
        });

        ArbExecutor.FlashParams memory params = ArbExecutor.FlashParams({
            profitToken: address(token),
            minProfit: 0,
            deadline: block.timestamp + 1 hours,
            routeHash: keccak256(abi.encode(calls)),
            calls: calls
        });

        executor.executeArb(address(token), 100, params);

        assertEq(token.balanceOf(address(executor)), 0);
        assertEq(token.balanceOf(address(vault)), 1_000);
        assertEq(token.allowance(address(executor), address(0x2001)), type(uint256).max);
    }
}
