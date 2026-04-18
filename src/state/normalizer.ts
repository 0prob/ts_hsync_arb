
/**
 * src/state/normalizer.js — Unified pool state normalizer
 *
 * Converts protocol-specific raw pool state into a canonical format
 * that all routing, simulation, and profitability modules consume.
 *
 * Canonical shape:
 * {
 *   poolId:    string,    // lowercase pool address
 *   protocol:  string,    // e.g. "QUICKSWAP_V2", "UNISWAP_V3", "CURVE_STABLE", "BALANCER_WEIGHTED"
 *   token0:    string,    // lowercase address
 *   token1:    string,    // lowercase address (or more tokens via `tokens`)
 *   tokens:    string[],  // all tokens (length >= 2)
 *   fee:       bigint,    // protocol-specific fee representation
 *   timestamp: number,    // ms since epoch when state was fetched
 *
 *   // V2 fields (QUICKSWAP_V2, SUSHISWAP_V2)
 *   reserve0?:   bigint,
 *   reserve1?:   bigint,
 *
 *   // V3 fields (UNISWAP_V3, QUICKSWAP_V3, SUSHISWAP_V3)
 *   sqrtPriceX96?: bigint,
 *   tick?:          number,
 *   liquidity?:     bigint,
 *   tickSpacing?:   number,
 *   ticks?:         Map<number, { liquidityGross: bigint, liquidityNet: bigint }>,
 *   initialized?:   boolean,
 *
 *   // Curve fields
 *   balances?: bigint[],  // per-token balances in 1e18 precision
 *   rates?:    bigint[],  // rate multipliers (1e18 = 1.0)
 *   A?:        bigint,    // amplification coefficient
 *
 *   // Balancer fields
 *   weights?:  bigint[],  // normalized weights (sum = 1e18)
 *   swapFee?:  bigint,    // fee in 1e18 precision
 * }
 */

import { defaultRates } from "../math/curve.ts";

// ─── Protocol classification ──────────────────────────────────

const V2_PROTOCOLS = new Set([
  "QUICKSWAP_V2",
  "SUSHISWAP_V2",
  "UNISWAP_V2",
]);

const V3_PROTOCOLS = new Set([
  "UNISWAP_V3",
  "QUICKSWAP_V3",
  "SUSHISWAP_V3",
]);

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

// ─── Normalizers ──────────────────────────────────────────────

/**
 * Normalize a V2 pool state.
 *
 * @param {string}   poolAddress  Lowercase pool address
 * @param {string}   protocol     Protocol key
 * @param {string[]} tokens       [token0, token1] lowercase
 * @param {Object}   rawState     From fetchV2PoolState()
 * @param {Object}   [meta]       Registry metadata (fee override, etc.)
 * @returns {Object}  Canonical pool state
 */
export function normalizeV2State(poolAddress: any, protocol: any, tokens: any, rawState: any, meta: any = {}) {
  // V2 fee: default 997/1000 (0.3%). SushiSwap also 0.3%.
  // Some forks differ — use registry metadata if available.
  const feeNumerator = meta?.feeNumerator != null ? BigInt(meta.feeNumerator) : 997n;

  return {
    poolId: poolAddress.toLowerCase(),
    protocol,
    token0: (tokens[0] || "").toLowerCase(),
    token1: (tokens[1] || "").toLowerCase(),
    tokens: tokens.map((t: any) => t.toLowerCase()),
    fee: feeNumerator,        // 997 = 0.3% fee (out of 1000)
    reserve0: rawState.reserve0,
    reserve1: rawState.reserve1,
    timestamp: rawState.fetchedAt || Date.now(),
  };
}

/**
 * Normalize a V3 pool state.
 *
 * @param {string}   poolAddress  Lowercase pool address
 * @param {string}   protocol     Protocol key
 * @param {string[]} tokens       [token0, token1] lowercase
 * @param {Object}   rawState     From fetchV3PoolState()
 * @param {Object}   [meta]       Registry metadata
 * @returns {Object}  Canonical pool state
 */
export function normalizeV3State(poolAddress: any, protocol: any, tokens: any, rawState: any, meta: any = {}) {
  return {
    poolId: poolAddress.toLowerCase(),
    protocol,
    token0: (tokens[0] || "").toLowerCase(),
    token1: (tokens[1] || "").toLowerCase(),
    tokens: tokens.map((t: any) => t.toLowerCase()),
    fee: BigInt(rawState.fee || meta?.fee || 3000),
    sqrtPriceX96: rawState.sqrtPriceX96,
    tick: rawState.tick,
    liquidity: rawState.liquidity,
    tickSpacing: rawState.tickSpacing,
    ticks: rawState.ticks || new Map(),
    initialized: rawState.initialized !== false,
    timestamp: rawState.fetchedAt || Date.now(),
  };
}

/**
 * Normalize a Curve pool state.
 *
 * @param {string}   poolAddress  Lowercase pool address
 * @param {string}   protocol     Protocol key
 * @param {string[]} tokens       Token addresses
 * @param {Object}   rawState     From poll_curve.js
 * @param {Object}   [meta]       Registry metadata (A, fee, etc.)
 * @returns {Object}  Canonical pool state
 */
export function normalizeCurveState(poolAddress: any, protocol: any, tokens: any, rawState: any, meta: any = {}) {
  const n = tokens.length;
  const rates = rawState.rates || defaultRates(n);
  const A = rawState.A || BigInt(meta?.A || 100) * 100n; // A in A_PRECISION units

  return {
    poolId: poolAddress.toLowerCase(),
    protocol,
    token0: (tokens[0] || "").toLowerCase(),
    token1: (tokens[1] || "").toLowerCase(),
    tokens: tokens.map((t: any) => t.toLowerCase()),
    fee: rawState.fee || BigInt(meta?.fee || 4_000_000n),  // default 0.04% in 1e10
    balances: rawState.balances || [],
    rates,
    A,
    virtualPrice: rawState.virtualPrice || 0n,
    timestamp: rawState.fetchedAt || Date.now(),
  };
}

/**
 * Normalize a Balancer pool state.
 *
 * @param {string}   poolAddress  Lowercase pool address
 * @param {string}   protocol     Protocol key
 * @param {string[]} tokens       Token addresses
 * @param {Object}   rawState     From poll_balancer.js
 * @param {Object}   [meta]       Registry metadata (weights, swapFee)
 * @returns {Object}  Canonical pool state
 */
export function normalizeBalancerState(poolAddress: any, protocol: any, tokens: any, rawState: any, meta: any = {}) {
  const n = tokens.length;
  const ONE = 10n ** 18n;

  // Default: equal weights
  const weights = rawState.weights ||
    (meta?.weights?.map(BigInt)) ||
    Array(n).fill(ONE / BigInt(n));

  return {
    poolId: poolAddress.toLowerCase(),
    protocol,
    token0: (tokens[0] || "").toLowerCase(),
    token1: (tokens[1] || "").toLowerCase(),
    tokens: tokens.map((t: any) => t.toLowerCase()),
    fee: rawState.swapFee || BigInt(meta?.swapFee || 3_000_000_000_000_000n), // 0.3%
    balances: rawState.balances || [],
    weights,
    swapFee: rawState.swapFee || BigInt(meta?.swapFee || 3_000_000_000_000_000n) as any,
    timestamp: rawState.fetchedAt || Date.now(),
  };
}

// ─── Protocol-aware dispatch ──────────────────────────────────

/**
 * Normalize any pool state into the canonical format.
 *
 * This is the primary entry point used by pollers and the arb loop.
 *
 * @param {string}   poolAddress  Lowercase pool address
 * @param {string}   protocol     Protocol key
 * @param {string[]} tokens       Token addresses
 * @param {Object}   rawState     Raw state from protocol-specific fetcher
 * @param {Object}   [meta]       Registry metadata
 * @returns {Object|null}  Canonical pool state, or null if protocol unknown
 */
export function normalizePoolState(poolAddress: any, protocol: any, tokens: any, rawState: any, meta: any = {}) {
  if (!rawState) return null;

  const addr = poolAddress.toLowerCase();

  if (V2_PROTOCOLS.has(protocol)) {
    return normalizeV2State(addr, protocol, tokens, rawState, meta);
  }

  if (V3_PROTOCOLS.has(protocol)) {
    return normalizeV3State(addr, protocol, tokens, rawState, meta);
  }

  if (CURVE_PROTOCOLS.has(protocol)) {
    return normalizeCurveState(addr, protocol, tokens, rawState, meta);
  }

  if (BALANCER_PROTOCOLS.has(protocol)) {
    return normalizeBalancerState(addr, protocol, tokens, rawState, meta);
  }

  console.warn(`[normalizer] Unknown protocol: ${protocol} for pool ${addr}`);
  return null;
}

/**
 * Validate that a canonical pool state has the fields required for simulation.
 *
 * @param {Object} state  Canonical pool state
 * @returns {{ valid: boolean, reason?: string }}
 */
export function validatePoolState(state: any) {
  if (!state) return { valid: false, reason: "null state" };
  if (!state.poolId) return { valid: false, reason: "missing poolId" };
  if (!state.protocol) return { valid: false, reason: "missing protocol" };
  if (!state.tokens || state.tokens.length < 2)
    return { valid: false, reason: "fewer than 2 tokens" };

  if (V2_PROTOCOLS.has(state.protocol)) {
    if (state.reserve0 == null || state.reserve1 == null)
      return { valid: false, reason: "V2: missing reserves" };
    if (state.reserve0 <= 0n || state.reserve1 <= 0n)
      return { valid: false, reason: "V2: zero reserves" };
  } else if (V3_PROTOCOLS.has(state.protocol)) {
    if (!state.initialized)
      return { valid: false, reason: "V3: not initialized" };
    if (!state.sqrtPriceX96 || state.sqrtPriceX96 === 0n)
      return { valid: false, reason: "V3: zero sqrtPrice" };
    if (!state.liquidity || state.liquidity === 0n)
      return { valid: false, reason: "V3: zero liquidity" };
  } else if (CURVE_PROTOCOLS.has(state.protocol)) {
    if (!state.balances || state.balances.length < 2)
      return { valid: false, reason: "Curve: missing balances" };
    if (state.balances.some((b: any) => b <= 0n))
      return { valid: false, reason: "Curve: zero balance" };
    if (!state.A || state.A <= 0n)
      return { valid: false, reason: "Curve: missing A" };
  } else if (BALANCER_PROTOCOLS.has(state.protocol)) {
    if (!state.balances || state.balances.length < 2)
      return { valid: false, reason: "Balancer: missing balances" };
    if (!state.weights || state.weights.length < 2)
      return { valid: false, reason: "Balancer: missing weights" };
    if (state.balances.some((b: any) => b <= 0n))
      return { valid: false, reason: "Balancer: zero balance" };
  }

  return { valid: true };
}

// ─── Protocol sets export ─────────────────────────────────────

export { V2_PROTOCOLS, V3_PROTOCOLS, CURVE_PROTOCOLS, BALANCER_PROTOCOLS };
