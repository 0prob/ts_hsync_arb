
/**
 * src/execution/calldata.js — Multihop calldata encoder
 *
 * Converts a simulated arbitrage route (from src/routing/simulator.js)
 * into a Call[] array suitable for ArbExecutor.executeArb().
 *
 * Encoding strategy per protocol:
 *
 *   V2 (QuickSwap, SushiSwap) — Direct pair.swap pattern:
 *     Call 1: ERC20(tokenIn).transfer(pair, amountIn)
 *     Call 2: pair.swap(amount0Out, amount1Out, recipient, "0x")
 *
 *   V3 (Uniswap V3) — Direct pool.swap pattern:
 *     Call 1: pool.swap(recipient, zeroForOne, amountSpecified, sqrtPriceLimitX96, callbackData)
 *     (ArbExecutor implements IUniswapV3SwapCallback to pay the pool)
 *
 * All amounts are BigInt. Addresses are checksummed via viem's getAddress().
 */

import { encodeFunctionData, getAddress, keccak256, encodeAbiParameters } from "viem";
import {
  ERC20_TRANSFER_ABI,
  V2_PAIR_SWAP_ABI,
  V3_POOL_SWAP_ABI,
  CURVE_EXCHANGE_INT128_ABI,
  CURVE_EXCHANGE_UINT256_ABI,
  BALANCER_VAULT_SWAP_ABI,
  EXECUTOR_ABI,
  EXECUTOR_APPROVE_IF_NEEDED_ABI,
} from "./abi_fragments.ts";
import {
  BALANCER_VAULT,
  DIRECT_SWAP_PROTOCOLS,
  CURVE_STABLE_PROTOCOLS,
  CURVE_CRYPTO_PROTOCOLS,
  BALANCER_PROTOCOLS,
  V3_SWAP_PROTOCOLS,
} from "./addresses.ts";
import { MIN_SQRT_RATIO, MAX_SQRT_RATIO } from "../math/tick_math.ts";

const CALL_STRUCT_ARRAY_ABI = [
  {
    type: "tuple[]",
    components: [
      { name: "target", type: "address" },
      { name: "value", type: "uint256" },
      { name: "data", type: "bytes" },
    ],
  },
] as const;

function normalizeExecutorCall(call: any, index: number) {
  if (!call || typeof call !== "object") {
    throw new Error(`executor call ${index} must be an object`);
  }

  const target = getAddress(call.target);
  const value = BigInt(call.value ?? 0);
  if (value < 0n) {
    throw new Error(`executor call ${index} value must be >= 0`);
  }

  const data = typeof call.data === "string" ? call.data : "";
  if (!/^0x([0-9a-fA-F]{2})*$/.test(data)) {
    throw new Error(`executor call ${index} data must be a 0x-prefixed even-length hex string`);
  }

  return {
    target,
    value,
    data: data.toLowerCase(),
  };
}

function normalizeExecutorCalls(calls: any) {
  if (!Array.isArray(calls)) {
    throw new Error("executor calls must be an array");
  }
  return calls.map((call, index) => normalizeExecutorCall(call, index));
}

// ─── Per-hop encoders ─────────────────────────────────────────

const CALLBACK_PROTOCOL_UNISWAP_V3 = 1;
const CALLBACK_PROTOCOL_SUSHISWAP_V3 = 2;
const CALLBACK_PROTOCOL_QUICKSWAP_V3 = 3;
const CALLBACK_PROTOCOL_KYBER_ELASTIC = 4;

function callbackProtocolId(protocol: any) {
  switch (protocol) {
    case "UNISWAP_V3":
      return CALLBACK_PROTOCOL_UNISWAP_V3;
    case "SUSHISWAP_V3":
      return CALLBACK_PROTOCOL_SUSHISWAP_V3;
    case "QUICKSWAP_V3":
      return CALLBACK_PROTOCOL_QUICKSWAP_V3;
    case "KYBERSWAP_ELASTIC":
      return CALLBACK_PROTOCOL_KYBER_ELASTIC;
    default:
      throw new Error(`encodeV3Hop: unsupported callback protocol ${protocol}`);
  }
}

function poolTokensFromHop(hop: any) {
  return hop.zeroForOne
    ? { token0: getAddress(hop.tokenIn), token1: getAddress(hop.tokenOut) }
    : { token0: getAddress(hop.tokenOut), token1: getAddress(hop.tokenIn) };
}

function encodeDynamicApprovalCall(
  executor: string,
  token: string,
  spender: string,
  amount: bigint,
) {
  return {
    target: getAddress(executor),
    value: 0n,
    data: encodeFunctionData({
      abi: EXECUTOR_APPROVE_IF_NEEDED_ABI,
      functionName: "approveIfNeeded",
      args: [getAddress(token), getAddress(spender), amount],
    }),
  };
}

/**
 * Encode a V2 direct pair swap (transfer-first pattern).
 *
 * @param {Object} hop
 * @param {string} hop.poolAddress   Pair contract address
 * @param {string} hop.tokenIn       Input token address
 * @param {string} hop.tokenOut      Output token address
 * @param {boolean} hop.zeroForOne   Swap direction
 * @param {bigint} hop.amountIn      Input amount
 * @param {bigint} hop.amountOut     Expected output amount
 * @param {string} recipient         Address to receive output tokens
 * @returns {Array<{target: string, value: bigint, data: string}>}  1-2 Call structs
 */
export function encodeV2Hop(hop: any, recipient: any) {
  const pair = getAddress(hop.poolAddress);
  const tokenIn = getAddress(hop.tokenIn);
  const calls = [];

  // Call 1: Transfer input tokens to the pair
  const transferData = encodeFunctionData({
    abi: ERC20_TRANSFER_ABI,
    functionName: "transfer",
    args: [pair, hop.amountIn],
  });

  calls.push({
    target: tokenIn,
    value: 0n,
    data: transferData,
  });

  // Call 2: Execute the swap
  // V2 swap: if zeroForOne, we want amount1Out; if !zeroForOne, we want amount0Out
  const amount0Out = hop.zeroForOne ? 0n : hop.amountOut;
  const amount1Out = hop.zeroForOne ? hop.amountOut : 0n;

  const swapData = encodeFunctionData({
    abi: V2_PAIR_SWAP_ABI,
    functionName: "swap",
    args: [amount0Out, amount1Out, getAddress(recipient), "0x"],
  });

  calls.push({
    target: pair,
    value: 0n,
    data: swapData,
  });

  return calls;
}

/**
 * Encode a V3 direct pool swap (callback-based payment).
 *
 * @param {Object} hop
 * @param {string} hop.poolAddress   Pool contract address
 * @param {string} hop.tokenIn       Input token address
 * @param {string} hop.tokenOut      Output token address
 * @param {boolean} hop.zeroForOne   Swap direction
 * @param {bigint} hop.amountIn      Input amount
 * @param {bigint} hop.amountOut     Expected output (used for slippage check if needed)
 * @param {string} recipient         Address to receive output tokens
 * @param {Object} [options]
 * @returns {Array<{target: string, value: bigint, data: string}>}  1 Call struct
 */
export function encodeV3Hop(hop: any, recipient: any) {
  const pool = getAddress(hop.poolAddress);
  const { token0, token1 } = poolTokensFromHop(hop);

  // amountSpecified: positive for exact input
  const amountSpecified = hop.amountIn;

  // sqrtPriceLimitX96: the price limit for the swap
  const sqrtPriceLimitX96 = hop.zeroForOne
    ? MIN_SQRT_RATIO + 1n
    : MAX_SQRT_RATIO - 1n;

  // Callback data is rich enough for the executor to authenticate the pool caller.
  const callbackData = encodeAbiParameters(
    [{
      type: "tuple",
      components: [
        { name: "protocolId", type: "uint8" },
        { name: "token0", type: "address" },
        { name: "token1", type: "address" },
        { name: "fee", type: "uint24" },
      ],
    }],
    [{
      protocolId: callbackProtocolId(hop.protocol),
      token0,
      token1,
      fee: hop.fee ?? 0,
    }]
  );

  const swapData = encodeFunctionData({
    abi: V3_POOL_SWAP_ABI,
    functionName: "swap",
    args: [
      getAddress(recipient),
      hop.zeroForOne,
      amountSpecified,
      sqrtPriceLimitX96,
      callbackData,
    ],
  });

  return [
    {
      target: pool,
      value: 0n,
      data: swapData,
    },
  ];
}

/**
 * Encode a Curve pool swap via exchange().
 */
export function encodeCurveHop(hop: any, executor: any, options: any = {}) {
  const { slippageBps = 50 } = options;
  const pool     = getAddress(hop.poolAddress);
  const tokenIn  = getAddress(hop.tokenIn);
  const tokenInIdx = Number(hop.tokenInIdx);
  const tokenOutIdx = Number(hop.tokenOutIdx);

  if (!Number.isInteger(tokenInIdx) || tokenInIdx < 0) {
    throw new Error(`encodeCurveHop: tokenInIdx required for pool ${hop.poolAddress}`);
  }
  if (!Number.isInteger(tokenOutIdx) || tokenOutIdx < 0) {
    throw new Error(`encodeCurveHop: tokenOutIdx required for pool ${hop.poolAddress}`);
  }
  if (tokenInIdx === tokenOutIdx) {
    throw new Error(`encodeCurveHop: token indices must differ for pool ${hop.poolAddress}`);
  }

  // Apply slippage to minimum output
  const minDy = (hop.amountOut * BigInt(10_000 - slippageBps)) / 10_000n;

  const calls = [];

  // Call 1: Ensure the pool can pull tokenIn from the executor.
  calls.push(encodeDynamicApprovalCall(executor, tokenIn, pool, hop.amountIn));

  // Call 2: Execute the exchange
  const abi = hop.isCrypto ? CURVE_EXCHANGE_UINT256_ABI : CURVE_EXCHANGE_INT128_ABI;
  const iIdx = hop.isCrypto ? BigInt(tokenInIdx)  : tokenInIdx;
  const jIdx = hop.isCrypto ? BigInt(tokenOutIdx) : tokenOutIdx;

  calls.push({
    target: pool,
    value: 0n,
    data: encodeFunctionData({
      abi,
      functionName: "exchange",
      args: [iIdx, jIdx, hop.amountIn, minDy],
    }),
  });

  return calls;
}

/**
 * Encode a Balancer V2 single-pool swap via Vault.swap().
 */
export function encodeBalancerHop(hop: any, executor: any, options: any = {}) {
  const { slippageBps = 50, deadline } = options;

  if (!hop.poolId) {
    throw new Error(`encodeBalancerHop: poolId required for pool ${hop.poolAddress}`);
  }
  if (deadline == null) {
    throw new Error(`encodeBalancerHop: deadline required for pool ${hop.poolAddress}`);
  }

  const vault    = getAddress(BALANCER_VAULT);
  const tokenIn  = getAddress(hop.tokenIn);
  const tokenOut = getAddress(hop.tokenOut);
  const exec     = getAddress(executor);

  // Minimum acceptable output with slippage
  const limit = (hop.amountOut * BigInt(10_000 - slippageBps)) / 10_000n;

  const calls = [];

  // Call 1: Ensure the Vault can pull tokenIn from the executor.
  calls.push(encodeDynamicApprovalCall(exec, tokenIn, vault, hop.amountIn));

  // Call 2: Vault.swap
  calls.push({
    target: vault,
    value: 0n,
    data: encodeFunctionData({
      abi: BALANCER_VAULT_SWAP_ABI,
      functionName: "swap",
      args: [
        // SingleSwap
        {
          poolId:   hop.poolId,
          kind:     0,          // GIVEN_IN
          assetIn:  tokenIn,
          assetOut: tokenOut,
          amount:   hop.amountIn,
          userData: "0x",
        },
        // FundManagement
        {
          sender:              exec,
          fromInternalBalance: false,
          recipient:           exec,
          toInternalBalance:   false,
        },
        limit,
        deadline,
      ],
    }),
  });

  return calls;
}

// ─── Route encoder ────────────────────────────────────────────

/**
 * Encode a complete multi-hop route into a Call[] array.
 */
export function encodeRoute(route: any, executorAddress: any, options: any = {}) {
  const { path, result } = route;
  const executor = getAddress(executorAddress);
  const calls = [];

  for (let i = 0; i < path.edges.length; i++) {
    const edge = path.edges[i];
    const amountIn  = result.hopAmounts[i];
    const amountOut = result.hopAmounts[i + 1];
    const proto = edge.protocol;

    const meta = edge.metadata || {};

    const hop = {
      protocol:     proto,
      poolAddress:  edge.poolAddress,
      tokenIn:      edge.tokenIn,
      tokenOut:     edge.tokenOut,
      zeroForOne:   edge.zeroForOne,
      amountIn,
      amountOut,
      fee:          edge.fee ?? meta.fee ?? 0,
      tokenInIdx:   edge.tokenInIdx ?? meta.tokenInIdx ?? (edge.zeroForOne ? 0 : 1),
      tokenOutIdx:  edge.tokenOutIdx ?? meta.tokenOutIdx ?? (edge.zeroForOne ? 1 : 0),
      isCrypto:     CURVE_CRYPTO_PROTOCOLS.has(edge.protocol),
      poolId:       meta.poolId || meta.pool_id || null,
    };

    if (DIRECT_SWAP_PROTOCOLS.has(proto)) {
      calls.push(...encodeV2Hop(hop, executor));
    } else if (V3_SWAP_PROTOCOLS.has(proto)) {
      calls.push(...encodeV3Hop(hop, executor));
    } else if (CURVE_STABLE_PROTOCOLS.has(proto) || CURVE_CRYPTO_PROTOCOLS.has(proto)) {
      calls.push(...encodeCurveHop(hop, executor, options));
    } else if (BALANCER_PROTOCOLS.has(proto)) {
      calls.push(...encodeBalancerHop(hop, executor, options));
    } else {
      throw new Error(`Unsupported protocol for execution: ${proto} at hop ${i}`);
    }
  }

  return calls;
}

// ─── Route hash ───────────────────────────────────────────────

/**
 * Compute the routeHash for a Call[] array.
 *
 * Must match Solidity exactly: keccak256(abi.encode(calls)) where
 * `calls` is `Call[]` and `Call` is `(address target,uint256 value,bytes data)`.
 */
export function computeRouteHash(calls: any) {
  const normalizedCalls = normalizeExecutorCalls(calls);
  const encoded = encodeAbiParameters(CALL_STRUCT_ARRAY_ABI, [
    normalizedCalls.map((c: any) => ({ target: c.target, value: c.value, data: c.data })),
  ]);

  return keccak256(encoded);
}

// ─── FlashParams builder ──────────────────────────────────────

/**
 * Build the complete FlashParams struct.
 */
export function buildFlashParams({
  profitToken,
  minProfit,
  deadline,
  calls,
}: any) {
  const normalizedCalls = normalizeExecutorCalls(calls);
  const routeHash = computeRouteHash(normalizedCalls);

  return {
    profitToken: getAddress(profitToken),
    minProfit,
    deadline,
    routeHash,
    calls: normalizedCalls,
  };
}

// ─── Top-level transaction encoder ────────────────────────────

/**
 * Encode the complete executeArb transaction calldata.
 */
export function encodeExecuteArb({
  executorAddress,
  flashToken,
  flashAmount,
  profitToken,
  minProfit,
  deadline,
  calls,
}: any) {
  const flashParams = buildFlashParams({
    profitToken,
    minProfit,
    deadline,
    calls,
  });

  const data = encodeFunctionData({
    abi: EXECUTOR_ABI,
    functionName: "executeArb",
    args: [
      getAddress(flashToken),
      flashAmount,
      flashParams,
    ],
  });

  return {
    to: getAddress(executorAddress),
    data,
    value: 0n,
  };
}
