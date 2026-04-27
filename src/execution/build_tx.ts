
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
import { recommendGasParams } from "./gas.ts";
import { routeExecutionCacheKey } from "../routing/route_identity.ts";
import { getPathHopCount } from "../routing/path_hops.ts";
import { normalizeEvmAddress } from "../util/pool_record.ts";
import { isSwapExecutionProtocol, normalizeProtocolKey } from "../protocols/classification.ts";

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
  const startToken = normalizeEvmAddress(route.path.startToken);
  if (!startToken) {
    throw new Error("buildArbTx: valid path.startToken required");
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
  if (route.result.hopAmounts[0] !== route.result.amountIn) {
    throw new Error("buildArbTx: hopAmounts must start with amountIn");
  }
  if (route.result.hopAmounts[route.result.hopAmounts.length - 1] !== route.result.amountOut) {
    throw new Error("buildArbTx: hopAmounts must end with amountOut");
  }
  const normalizedTokenPath = route.result.tokenPath.map((token: unknown) => normalizeEvmAddress(token));
  const normalizedPoolPath = route.result.poolPath.map((pool: unknown) => normalizeEvmAddress(pool));
  if (normalizedTokenPath.some((token: string | null) => token == null)) {
    throw new Error("buildArbTx: tokenPath contains invalid token address");
  }
  if (normalizedPoolPath.some((pool: string | null) => pool == null)) {
    throw new Error("buildArbTx: poolPath contains invalid pool address");
  }
  if (normalizedTokenPath[0] !== startToken) {
    throw new Error("buildArbTx: tokenPath must start with path.startToken");
  }
  if (normalizedTokenPath[normalizedTokenPath.length - 1] !== startToken) {
    throw new Error("buildArbTx: tokenPath must end with path.startToken");
  }
  const normalizedEdges: Array<{ poolAddress: string; protocol: string; tokenIn: string; tokenOut: string }> = [];
  for (let i = 0; i < route.path.edges.length; i++) {
    const edge = route.path.edges[i];
    const protocol = normalizeProtocolKey(edge?.protocol);
    if (!protocol) throw new Error(`buildArbTx: edge ${i} missing protocol`);
    if (!isSwapExecutionProtocol(protocol)) {
      throw new Error(`buildArbTx: edge ${i} uses unsupported execution protocol ${protocol}`);
    }
    const edgeTokenIn = normalizeEvmAddress(edge?.tokenIn);
    const edgeTokenOut = normalizeEvmAddress(edge?.tokenOut);
    const edgePool = normalizeEvmAddress(edge?.poolAddress);
    if (!edgeTokenIn || !edgeTokenOut || !edgePool) {
      throw new Error(`buildArbTx: edge ${i} contains invalid route address`);
    }
    if (normalizedTokenPath[i] !== edgeTokenIn) {
      throw new Error(`buildArbTx: tokenPath input mismatch at hop ${i}`);
    }
    if (normalizedTokenPath[i + 1] !== edgeTokenOut) {
      throw new Error(`buildArbTx: tokenPath output mismatch at hop ${i}`);
    }
    if (normalizedPoolPath[i] !== edgePool) {
      throw new Error(`buildArbTx: poolPath mismatch at hop ${i}`);
    }
    normalizedEdges.push({ poolAddress: edgePool, protocol, tokenIn: edgeTokenIn, tokenOut: edgeTokenOut });
  }

  route.path.startToken = startToken;
  route.result.tokenPath = normalizedTokenPath;
  route.result.poolPath = normalizedPoolPath;
  for (let i = 0; i < route.path.edges.length; i++) {
    route.path.edges[i].poolAddress = normalizedEdges[i].poolAddress;
    route.path.edges[i].protocol = normalizedEdges[i].protocol;
    route.path.edges[i].tokenIn = normalizedEdges[i].tokenIn;
    route.path.edges[i].tokenOut = normalizedEdges[i].tokenOut;
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

export function gasEstimateCacheKeyForRoute(
  route: any,
  context: { fromAddress?: unknown; executorAddress?: unknown; callCount?: unknown } = {},
) {
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

  const routeKey = routeExecutionCacheKey(startToken, hopCount, edges);
  const fromAddress = normalizeEvmAddress(context.fromAddress);
  const executorAddress = normalizeEvmAddress(context.executorAddress);
  const callCount = Number(context.callCount);
  const hasContext = context.fromAddress != null || context.executorAddress != null || context.callCount != null;
  if (!hasContext) return routeKey;
  if (!fromAddress) {
    throw new Error("gasEstimateCacheKeyForRoute: valid fromAddress required when cache context is provided");
  }
  if (!executorAddress) {
    throw new Error("gasEstimateCacheKeyForRoute: valid executorAddress required when cache context is provided");
  }
  if (!Number.isSafeInteger(callCount) || callCount <= 0) {
    throw new Error("gasEstimateCacheKeyForRoute: callCount must be a positive integer when cache context is provided");
  }

  return `gas:${fromAddress}:${executorAddress}:calls=${callCount}:${routeKey}`;
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
 * @property {bigint}  effectiveGasPriceWei Expected EIP-1559 paid gas price
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
 * @param {bigint} [options.maxEstimatedCostWei]
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
    maxEstimatedCostWei,
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
    gasEstimateCacheKeyOverride ??
    gasEstimateCacheKeyForRoute(route, {
      fromAddress,
      executorAddress,
      callCount: calls.length,
    });

  const gasParams = gasParamsOverride ?? await recommendGasParams(skelTx, fromAddress, {
    gasMultiplier,
    maxFeeOverride,
    priorityFeeOverride,
    maxEstimatedCostWei,
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
    maxGasCostWei: gasParams.maxCostWei?.toString?.(),
    maxEstimatedGasCostWei: maxEstimatedCostWei?.toString?.(),
  };

  return {
    to: encodedTx.to,
    data: encodedTx.data,
    value: 0n,
    maxFeePerGas: gasParams.maxFeePerGas,
    maxPriorityFeePerGas: gasParams.maxPriorityFeePerGas,
    gasLimit: gasParams.gasLimit,
    effectiveGasPriceWei: gasParams.effectiveGasPriceWei,
    maxCostWei: gasParams.maxCostWei,
    gasEstimateCacheKey: gasEstimateKey,
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
