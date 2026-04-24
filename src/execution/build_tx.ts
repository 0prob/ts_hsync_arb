
/**
 * src/execution/build_tx.js — Transaction builder
 *
 * Constructs the complete transaction object for an arbitrage execution.
 * Delegates calldata encoding to the existing calldata.js module and
 * adds gas parameters from gas.js.
 *
 * This module is a pure builder — it does not submit transactions.
 * Use send_tx.js for submission.
 *
 * Usage:
 *   import { buildArbTx } from "./build_tx.js";
 *   const tx = await buildArbTx(route, config);
 *   // tx: { to, data, value, maxFeePerGas, maxPriorityFeePerGas, gasLimit, ... }
 */

import { encodeRoute, encodeExecuteArb, buildFlashParams } from "./calldata.ts";
import { gasEstimateCacheKey, recommendGasParams } from "./gas.ts";
import { routeExecutionCacheKey } from "../routing/route_identity.ts";
import { getPathHopCount } from "../routing/path_hops.ts";

// ─── Defaults ─────────────────────────────────────────────────

const DEFAULT_DEADLINE_OFFSET_S = 120;
const DEFAULT_SLIPPAGE_BPS = 50;
const DEFAULT_MIN_PROFIT = 0n;
const DEFAULT_GAS_MULTIPLIER = 1.25;
const EXECUTOR_MAX_CALLS = 12;

function assertValidRouteForExecution(route: any) {
  if (!route?.path || !route?.result) {
    throw new Error("buildArbTx: route path/result required");
  }
  if (!route.path.startToken) {
    throw new Error("buildArbTx: path.startToken required");
  }
  if (!Array.isArray(route.path.edges) || route.path.edges.length === 0) {
    throw new Error("buildArbTx: path.edges must be non-empty");
  }
  if (route.result.amountIn == null || route.result.amountIn <= 0n) {
    throw new Error("buildArbTx: result.amountIn must be > 0");
  }
  if (route.result.amountOut == null || route.result.amountOut <= 0n) {
    throw new Error("buildArbTx: result.amountOut must be > 0");
  }
  if (route.result.profit == null || route.result.profit !== route.result.amountOut - route.result.amountIn) {
    throw new Error("buildArbTx: inconsistent result.profit");
  }
  if (!Array.isArray(route.result.hopAmounts) || route.result.hopAmounts.length !== route.path.edges.length + 1) {
    throw new Error("buildArbTx: hopAmounts length mismatch");
  }
  if (!Array.isArray(route.result.tokenPath) || route.result.tokenPath.length !== route.path.edges.length + 1) {
    throw new Error("buildArbTx: tokenPath length mismatch");
  }
  if (!Array.isArray(route.result.poolPath) || route.result.poolPath.length !== route.path.edges.length) {
    throw new Error("buildArbTx: poolPath length mismatch");
  }
  if (route.result.tokenPath[0] !== route.path.startToken) {
    throw new Error("buildArbTx: tokenPath must start with path.startToken");
  }
  for (let i = 0; i < route.path.edges.length; i++) {
    const edge = route.path.edges[i];
    if (route.result.tokenPath[i] !== edge.tokenIn) {
      throw new Error(`buildArbTx: tokenPath input mismatch at hop ${i}`);
    }
    if (route.result.tokenPath[i + 1] !== edge.tokenOut) {
      throw new Error(`buildArbTx: tokenPath output mismatch at hop ${i}`);
    }
    if (route.result.poolPath[i] !== edge.poolAddress) {
      throw new Error(`buildArbTx: poolPath mismatch at hop ${i}`);
    }
  }

  for (const [index, edge] of route.path.edges.entries()) {
    if (!edge?.protocol) throw new Error(`buildArbTx: edge ${index} missing protocol`);
    if (!edge?.poolAddress) throw new Error(`buildArbTx: edge ${index} missing poolAddress`);
    if (!edge?.tokenIn || !edge?.tokenOut) throw new Error(`buildArbTx: edge ${index} missing token addresses`);
  }
}

// ─── Helpers ──────────────────────────────────────────────────

/**
 * Determine the flash loan token and amount for a route.
 *
 * @param {Object} route  { path, result }
 * @returns {{ flashToken: string, flashAmount: bigint }}
 */
function resolveFlashLoan(route: any) {
  return {
    flashToken: route.path.startToken,
    flashAmount: route.result.amountIn,
  };
}

export function gasEstimateCacheKeyForRoute(route: any) {
  const startToken = route?.path?.startToken;
  const edges = route?.path?.edges;
  const hopCount = getPathHopCount(route?.path);

  if (!startToken) {
    throw new Error("gasEstimateCacheKeyForRoute: path.startToken required");
  }
  if (!Array.isArray(edges) || edges.length === 0) {
    throw new Error("gasEstimateCacheKeyForRoute: path.edges must be non-empty");
  }
  if (!Number.isFinite(hopCount) || hopCount <= 0) {
    throw new Error("gasEstimateCacheKeyForRoute: path hop count must be > 0");
  }

  return routeExecutionCacheKey(startToken, hopCount, edges);
}
// ─── Main builder ─────────────────────────────────────────────

/**
 * @typedef {Object} BuiltTx
 * @property {string}  to                   Contract to call (ArbExecutor)
 * @property {string}  data                 Encoded calldata
 * @property {bigint}  value                ETH value (0 for ERC-20 arbs)
 * @property {bigint}  maxFeePerGas         EIP-1559 max fee
 * @property {bigint}  maxPriorityFeePerGas EIP-1559 priority fee
 * @property {bigint}  gasLimit             Gas limit with safety buffer
 * @property {Object}  meta                 Human-readable metadata
 * @property {Object}  flashParams          Encoded flash loan params
 */

/**
 * Build a complete arbitrage transaction (without submitting).
 *
 * @param {Object} route              Profitable route { path, result }
 * @param {Object} config
 * @param {string} config.executorAddress  Deployed ArbExecutor contract address
 * @param {string} config.fromAddress      Sender/signer address (for gas estimation)
 * @param {Object} [options]
 * @param {bigint} [options.minProfit]     Minimum profit enforced on-chain
 * @param {number} [options.deadlineOffsetS]
 * @param {number} [options.slippageBps]
 * @param {number} [options.gasMultiplier]
 * @param {bigint} [options.maxFeeOverride]
 * @param {bigint} [options.priorityFeeOverride]
 * @param {{maxFeePerGas: bigint, maxPriorityFeePerGas: bigint, gasLimit: bigint, estimatedCostWei: bigint}} [options.gasParamsOverride]
 * @returns {Promise<BuiltTx>}
 */
export async function buildArbTx(route: any, config: any, options: any = {}) {
  const { executorAddress, fromAddress } = config;
  const {
    minProfit = DEFAULT_MIN_PROFIT,
    deadlineOffsetS = DEFAULT_DEADLINE_OFFSET_S,
    slippageBps = DEFAULT_SLIPPAGE_BPS,
    gasMultiplier = DEFAULT_GAS_MULTIPLIER,
    maxFeeOverride,
    priorityFeeOverride,
    gasEstimateCacheKey: gasEstimateCacheKeyOverride,
    gasParamsOverride = null,
  } = options;

  if (!executorAddress) throw new Error("buildArbTx: executorAddress required");
  if (!fromAddress) throw new Error("buildArbTx: fromAddress required");
  assertValidRouteForExecution(route);
  if (!Number.isFinite(deadlineOffsetS) || deadlineOffsetS <= 0) {
    throw new Error("buildArbTx: deadlineOffsetS must be > 0");
  }
  if (!Number.isFinite(slippageBps) || slippageBps < 0 || slippageBps > 10_000) {
    throw new Error("buildArbTx: slippageBps must be between 0 and 10000");
  }
  if (!Number.isFinite(gasMultiplier) || gasMultiplier <= 0) {
    throw new Error("buildArbTx: gasMultiplier must be > 0");
  }
  if (minProfit < 0n) throw new Error("buildArbTx: minProfit must be >= 0");

  const { flashToken, flashAmount } = resolveFlashLoan(route);
  const profitToken = route.path.startToken;
  const deadline = BigInt(Math.floor(Date.now() / 1000) + deadlineOffsetS);

  // Encode route into Call[]
  const calls = encodeRoute(route, executorAddress, { slippageBps, deadline });
  if (calls.length > EXECUTOR_MAX_CALLS) {
    throw new Error(`buildArbTx: route expands to ${calls.length} executor calls (max ${EXECUTOR_MAX_CALLS})`);
  }

  // Build flash loan params (includes route hash)
  const flashParams = buildFlashParams({ profitToken, minProfit, deadline, calls });

  // Encode full executeArb calldata
  const encodedTx = encodeExecuteArb({
    executorAddress,
    flashToken,
    flashAmount,
    profitToken,
    minProfit,
    deadline,
    calls,
  });

  // Build skeleton tx for gas estimation
  const skelTx = {
    to: encodedTx.to,
    data: encodedTx.data,
    value: 0n,
  };

  // Get gas params (estimate + EIP-1559 fees)
  const gasEstimateKey =
    gasEstimateCacheKeyOverride ?? gasEstimateCacheKey(skelTx, fromAddress);

  const gasParams = gasParamsOverride ?? await recommendGasParams(skelTx, fromAddress, {
    gasMultiplier,
    maxFeeOverride,
    priorityFeeOverride,
    gasEstimateCacheKey: gasEstimateKey,
  });

  // Metadata for logging
  const meta = {
    protocol: route.path.edges.map((e: any) => e.protocol),
    pools: route.result.poolPath,
    tokens: route.result.tokenPath,
    hopAmounts: route.result.hopAmounts.map(String),
    expectedProfit: route.result.profit.toString(),
    flashToken,
    flashAmount: flashAmount.toString(),
    callCount: calls.length,
    routeHash: flashParams.routeHash,
    deadline: Number(deadline),
    slippageBps,
    gasLimit: gasParams.gasLimit.toString(),
    estimatedGasCostWei: gasParams.estimatedCostWei.toString(),
  };

  return {
    to: encodedTx.to,
    data: encodedTx.data,
    value: 0n,
    maxFeePerGas: gasParams.maxFeePerGas,
    maxPriorityFeePerGas: gasParams.maxPriorityFeePerGas,
    gasLimit: gasParams.gasLimit,
    meta,
    flashParams,
    calls,
  };
}

/**
 * Build a simple ERC-20 transfer transaction (for testing/approval flows).
 *
 * @param {string} token      Token address
 * @param {string} to         Recipient
 * @param {bigint} amount     Amount in token units
 * @param {string} fromAddress Sender
 * @returns {Promise<BuiltTx>}
 */
export async function buildTransferTx(token: any, to: any, amount: any, fromAddress: any) {
  // ERC-20 transfer(address,uint256) = 0xa9059cbb
  const data =
    "0xa9059cbb" +
    to.replace("0x", "").padStart(64, "0") +
    amount.toString(16).padStart(64, "0");

  const skelTx = { to: token, data, value: 0n };
  const gasParams = await recommendGasParams(skelTx, fromAddress);

  return {
    to: token,
    data,
    value: 0n,
    ...gasParams,
    meta: { type: "erc20_transfer", token, to, amount: amount.toString() },
  };
}
