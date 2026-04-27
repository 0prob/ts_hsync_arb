// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import "forge-std/Test.sol";

import {ArbExecutor, IERC20Minimal} from "../src/ArbExecutor.sol";

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

contract Reverter {
    error Boom();

    function boom() external pure {
        revert Boom();
    }
}

contract MockBalancerVault {
    function flashLoan(address recipient, MockToken[] memory tokens, uint256[] memory amounts, bytes memory userData)
        external
    {
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

    function _params(address profitToken, uint256 minProfit, ArbExecutor.Call[] memory calls)
        internal
        view
        returns (ArbExecutor.FlashParams memory)
    {
        return ArbExecutor.FlashParams({
            profitToken: profitToken,
            minProfit: minProfit,
            deadline: block.timestamp + 1 hours,
            routeHash: keccak256(abi.encode(calls)),
            calls: calls
        });
    }

    function testExecuteArbRequiresFlashLoan() public {
        ArbExecutor.Call[] memory calls = new ArbExecutor.Call[](1);
        calls[0] = ArbExecutor.Call({target: address(0x2001), value: 0, data: hex"1234"});

        ArbExecutor.FlashParams memory params = _params(address(0x3001), 1, calls);

        vm.expectRevert(ArbExecutor.FlashLoanRequired.selector);
        executor.executeArb(address(0x4001), 0, params);
    }

    function testExecuteArbRequiresAuthorization() public {
        MockToken token = new MockToken();
        ArbExecutor.Call[] memory calls = new ArbExecutor.Call[](1);
        calls[0] = ArbExecutor.Call({target: address(executor), value: 0, data: hex""});
        ArbExecutor.FlashParams memory params = _params(address(token), 0, calls);

        vm.prank(address(0xBEEF));
        vm.expectRevert(ArbExecutor.Unauthorized.selector);
        executor.executeArb(address(token), 100, params);
    }

    function testExecuteArbAllowsOperator() public {
        MockToken token = new MockToken();
        token.mint(address(vault), 1_000);

        ArbExecutor.Call[] memory calls = new ArbExecutor.Call[](1);
        calls[0] = ArbExecutor.Call({
            target: address(token),
            value: 0,
            data: abi.encodeWithSelector(MockToken.mint.selector, address(executor), 1)
        });
        ArbExecutor.FlashParams memory params = _params(address(token), 1, calls);

        address operator = address(0xBEEF);
        executor.setOperator(operator, true);

        vm.prank(operator);
        executor.executeArb(address(token), 100, params);

        assertEq(token.balanceOf(address(executor)), 1);
    }

    function testExecuteArbRejectsExpiredDeadline() public {
        MockToken token = new MockToken();
        ArbExecutor.Call[] memory calls = new ArbExecutor.Call[](1);
        calls[0] = ArbExecutor.Call({target: address(token), value: 0, data: hex""});
        ArbExecutor.FlashParams memory params = ArbExecutor.FlashParams({
            profitToken: address(token),
            minProfit: 0,
            deadline: block.timestamp - 1,
            routeHash: keccak256(abi.encode(calls)),
            calls: calls
        });

        vm.expectRevert(ArbExecutor.DeadlineExpired.selector);
        executor.executeArb(address(token), 100, params);
    }

    function testExecuteArbRejectsEmptyRoute() public {
        MockToken token = new MockToken();
        ArbExecutor.Call[] memory calls = new ArbExecutor.Call[](0);
        ArbExecutor.FlashParams memory params = _params(address(token), 0, calls);

        vm.expectRevert(ArbExecutor.EmptyRoute.selector);
        executor.executeArb(address(token), 100, params);
    }

    function testExecuteArbRejectsTooManyCalls() public {
        MockToken token = new MockToken();
        ArbExecutor.Call[] memory calls = new ArbExecutor.Call[](13);
        for (uint256 i; i < calls.length;) {
            calls[i] = ArbExecutor.Call({target: address(token), value: 0, data: hex""});
            unchecked {
                ++i;
            }
        }
        ArbExecutor.FlashParams memory params = _params(address(token), 0, calls);

        vm.expectRevert(ArbExecutor.TooManyCalls.selector);
        executor.executeArb(address(token), 100, params);
    }

    function testExecuteArbRejectsInvalidRouteHash() public {
        MockToken token = new MockToken();
        ArbExecutor.Call[] memory calls = new ArbExecutor.Call[](1);
        calls[0] = ArbExecutor.Call({target: address(token), value: 0, data: hex""});
        ArbExecutor.FlashParams memory params = _params(address(token), 0, calls);
        params.routeHash = bytes32(uint256(params.routeHash) ^ 1);

        vm.expectRevert(ArbExecutor.InvalidRouteHash.selector);
        executor.executeArb(address(token), 100, params);
    }

    function testExecuteArbRejectsZeroAddresses() public {
        MockToken token = new MockToken();
        ArbExecutor.Call[] memory calls = new ArbExecutor.Call[](1);
        calls[0] = ArbExecutor.Call({target: address(token), value: 0, data: hex""});

        ArbExecutor.FlashParams memory zeroProfitToken = _params(address(0), 0, calls);
        vm.expectRevert(ArbExecutor.ZeroAddress.selector);
        executor.executeArb(address(token), 100, zeroProfitToken);

        ArbExecutor.FlashParams memory params = _params(address(token), 0, calls);
        vm.expectRevert(ArbExecutor.ZeroAddress.selector);
        executor.executeArb(address(0), 100, params);
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

        ArbExecutor.FlashParams memory params = _params(address(token), 0, calls);

        executor.executeArb(address(token), 100, params);

        assertEq(token.balanceOf(address(executor)), 0);
        assertEq(token.balanceOf(address(vault)), 1_000);
        assertEq(token.allowance(address(executor), address(0x2001)), type(uint256).max);
    }

    function testExecuteArbRevertsWhenProfitBelowMinimum() public {
        MockToken token = new MockToken();
        token.mint(address(vault), 1_000);

        ArbExecutor.Call[] memory calls = new ArbExecutor.Call[](1);
        calls[0] = ArbExecutor.Call({
            target: address(executor),
            value: 0,
            data: abi.encodeWithSelector(ArbExecutor.approveIfNeeded.selector, address(token), address(0x2001), 1)
        });

        ArbExecutor.FlashParams memory params = _params(address(token), 1, calls);

        vm.expectRevert(abi.encodeWithSelector(ArbExecutor.InsufficientProfit.selector, 0, 1));
        executor.executeArb(address(token), 100, params);
    }

    function testExecuteArbRevertsWhenRouteCallFails() public {
        MockToken token = new MockToken();
        Reverter reverter = new Reverter();
        token.mint(address(vault), 1_000);

        ArbExecutor.Call[] memory calls = new ArbExecutor.Call[](1);
        calls[0] = ArbExecutor.Call({
            target: address(reverter), value: 0, data: abi.encodeWithSelector(Reverter.boom.selector)
        });

        ArbExecutor.FlashParams memory params = _params(address(token), 0, calls);

        vm.expectRevert(
            abi.encodeWithSelector(
                ArbExecutor.ExternalCallFailed.selector,
                0,
                address(reverter),
                abi.encodeWithSelector(Reverter.Boom.selector)
            )
        );
        executor.executeArb(address(token), 100, params);
    }

    function testReceiveFlashLoanRejectsDirectCaller() public {
        IERC20Minimal[] memory tokens = new IERC20Minimal[](0);
        uint256[] memory amounts = new uint256[](0);
        uint256[] memory fees = new uint256[](0);

        vm.expectRevert(ArbExecutor.FlashLoanOnly.selector);
        executor.receiveFlashLoan(tokens, amounts, fees, "");
    }
}
