// @ts-nocheck
/**
 * src/routing/simulator.js — Full-protocol route simulator
 *
 * Executes a sequence of swap edges against pool state snapshots,
 * dispatching to the correct swap math based on protocol type.
 *
 * Supports:
 *   - Uniswap V2, QuickSwap V2, SushiSwap V2
 *   - Uniswap V3, QuickSwap V3, SushiSwap V3
 *   - Curve StableSwap
 *   - Balancer Weighted
 *
 * Pure function — no side effects, no RPC calls.
 */

import { simulateV2Swap } from "../math/uniswap_v2.ts";
import { simulateV3Swap } from "../math/uniswap_v3.ts";
import { simulateCurveSwap } from "../math/curve.ts";
import { simulateBalancerSwap } from "../math/balancer.ts";
import { workerPool } from "./worker_pool.ts";
import { EVAL_WORKER_THRESHOLD, WORKER_COUNT } from "../config/index.ts";

// ─── Protocol classification ─────────────────────────────────

const V2_PROTOCOLS = new Set(["QUICKSWAP_V2", "SUSHISWAP_V2", "UNISWAP_V2"]);
const V3_PROTOCOLS = new Set(["UNISWAP_V3", "QUICKSWAP_V3", "SUSHISWAP_V3"]);
const CURVE_PROTOCOLS = new Set([
  "CURVE_STABLE",
  "CURVE_CRYPTO",
  "CURVE_MAIN",
  "CURVE_FACTORY_STABLE",
  "CURVE_FACTORY_CRYPTO",
  "CURVE_CRYPTO_FACTORY",
  "CURVE_STABLE_FACTORY",
]);
const BALANCER_PROTOCOLS = new Set([
  "BALANCER_WEIGHTED",
  "BALANCER_STABLE",
  "BALANCER_V2",
]);

// ─── Single-hop simulation ────────────────────────────────────

/**
 * Simulate a single hop in a route.
 *
 * @param {import('./graph.ts').SwapEdge} edge   Swap edge
 * @param {bigint}                       amountIn
 * @param {Map<string, Object>}          stateCache  Canonical pool state map
 * @returns {{ amountOut: bigint, gasEstimate: number }}
 */
export function simulateHop(edge, amountIn, stateCache) {
  if (amountIn <= 0n) return { amountOut: 0n, gasEstimate: 0 };

  // Prefer pre-attached state from graph edge (V3 edges built with stateMap)
  const state = edge.stateRef || stateCache.get(edge.poolAddress);

  if (!state) {
    return { amountOut: 0n, gasEstimate: 0 };
  }

  const protocol = edge.protocol;

  // V3: use pre-attached swapFn if available (highest fidelity)
  if (edge.swapFn && edge.stateRef) {
    return edge.swapFn(amountIn, edge.zeroForOne, edge.stateRef, edge.fee);
  }

  if (V2_PROTOCOLS.has(protocol)) {
    const feeNum = state.fee != null ? state.fee : 997n;
    return simulateV2Swap(state, amountIn, edge.zeroForOne, feeNum);
  }

  if (V3_PROTOCOLS.has(protocol)) {
    return simulateV3Swap(state, amountIn, edge.zeroForOne, edge.fee);
  }

  if (CURVE_PROTOCOLS.has(protocol)) {
    return simulateCurveSwap(amountIn, state, edge.zeroForOne);
  }

  if (BALANCER_PROTOCOLS.has(protocol)) {
    return simulateBalancerSwap(amountIn, state, edge.zeroForOne);
  }

  console.warn(`[simulator] Unsupported protocol: ${protocol}`);
  return { amountOut: 0n, gasEstimate: 0 };
}

// ─── Multi-hop simulation ─────────────────────────────────────

/**
 * @typedef {Object} RouteSimResult
 * @property {bigint}   amountIn    Initial input amount
 * @property {bigint}   amountOut   Final output amount
 * @property {bigint}   profit      amountOut - amountIn (can be negative)
 * @property {boolean}  profitable  profit > 0
 * @property {bigint[]} hopAmounts  Amount at each hop boundary
 * @property {number}   totalGas    Total estimated gas
 * @property {string[]} poolPath    Ordered pool addresses
 * @property {string[]} tokenPath   Ordered token addresses (length = hops + 1)
 * @property {string[]} protocols   Protocol names per hop
 */

/**
 * Simulate a complete multi-hop arbitrage route.
 *
 * @param {import('./finder.ts').ArbPath} path       Arbitrage path
 * @param {bigint}                        amountIn   Starting input amount
 * @param {Map<string, Object>}           stateCache Canonical pool state map
 * @returns {RouteSimResult}
 */
export function simulateRoute(path, amountIn, stateCache) {
  const hopAmounts = [amountIn];
  const poolPath = [];
  const tokenPath = [path.startToken];
  const protocols = [];
  let totalGas = 0;
  let current = amountIn;

  for (const edge of path.edges) {
    const { amountOut, gasEstimate } = simulateHop(edge, current, stateCache);

    current = amountOut;
    hopAmounts.push(amountOut);
    poolPath.push(edge.poolAddress);
    tokenPath.push(edge.tokenOut);
    protocols.push(edge.protocol);
    totalGas += gasEstimate;

    if (amountOut === 0n) break; // No point continuing
  }

  const profit = current - amountIn;

  return {
    amountIn,
    amountOut: current,
    profit,
    profitable: profit > 0n,
    hopAmounts,
    totalGas,
    poolPath,
    tokenPath,
    protocols,
  };
}

/**
 * Find the optimal input amount for a route using ternary search.
 *
 * @param {import('./finder.ts').ArbPath} path
 * @param {Map<string, Object>}           stateCache
 * @param {Object} [options]
 * @param {bigint} [options.minAmount=1000n]
 * @param {bigint} [options.maxAmount]
 * @param {number} [options.iterations=40]
 * @returns {RouteSimResult|null}   Best result, or null if no profitable amount
 */
export function optimizeInputAmount(path, stateCache, options = {}) {
  const {
    minAmount = 1_000n,
    maxAmount = 10n ** 24n,
    iterations = 40,
    scorer = (result) => result.profit,
    accept = (result) => result.profitable,
  } = options;

  let lo = minAmount;
  let hi = maxAmount;
  let best = null;

  for (let i = 0; i < iterations; i++) {
    const third = (hi - lo) / 3n;
    if (third <= 0n) break;

    const m1 = lo + third;
    const m2 = hi - third;

    const r1 = simulateRoute(path, m1, stateCache);
    const r2 = simulateRoute(path, m2, stateCache);
    const s1 = scorer(r1);
    const s2 = scorer(r2);

    if (s1 > s2) {
      hi = m2;
      if (!best || s1 > scorer(best)) best = r1;
    } else {
      lo = m1;
      if (!best || s2 > scorer(best)) best = r2;
    }
  }

  // Final evaluation at midpoint
  const mid = (lo + hi) / 2n;
  if (mid > 0n) {
    const midResult = simulateRoute(path, mid, stateCache);
    if (!best || scorer(midResult) > scorer(best)) best = midResult;
  }

  return best && accept(best) ? best : null;
}

/**
 * Evaluate a batch of paths and return profitable ones sorted by profit.
 *
 * @param {import('./finder.ts').ArbPath[]} paths
 * @param {Map<string, Object>}             stateCache
 * @param {bigint}                          testAmount  Quick test amount
 * @param {Object} [options]
 * @param {boolean} [options.optimize=false]  Run ternary search on profitable paths
 * @returns {Array<{ path: Object, result: RouteSimResult }>}
 */
export function evaluatePaths(paths, stateCache, testAmount, options = {}) {
  const { optimize = false } = options;
  const profitable = [];

  for (const path of paths) {
    let result = simulateRoute(path, testAmount, stateCache);

    if (result.profitable) {
      if (optimize) {
        const optimized = optimizeInputAmount(path, stateCache);
        if (optimized) result = optimized;
      }
      profitable.push({ path, result });
    }
  }

  profitable.sort((a, b) => {
    if (b.result.profit > a.result.profit) return 1;
    if (b.result.profit < a.result.profit) return -1;
    return 0;
  });

  return profitable;
}

/**
 * Evaluate a batch of paths in parallel using the persistent WorkerPool.
 *
 * Falls back to synchronous evaluation when the path count is below the
 * configured threshold (avoids IPC overhead for small batches).
 *
 * @param {import('./finder.ts').ArbPath[]} paths
 * @param {Map<string, Object>}             stateCache
 * @param {bigint}                          testAmount
 * @param {Object} [options]
 * @param {number} [options.workerCount]    Ignored — pool size is set at startup
 * @returns {Promise<Array<{ path: Object, result: RouteSimResult }>>}
 */
export async function evaluatePathsParallel(paths, stateCache, testAmount, options = {}) {
  const { optimize = false } = options;

  // Below the threshold the IPC serialisation overhead exceeds the parallelism gain
  if (paths.length < EVAL_WORKER_THRESHOLD || WORKER_COUNT < 2) {
    return evaluatePaths(paths, stateCache, testAmount, { optimize });
  }

  return workerPool.evaluate(paths, stateCache, testAmount, { optimize });
}
