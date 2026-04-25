
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
import { MIN_TICK, MAX_TICK } from "../math/tick_math.ts";
import {
  BALANCER_PROTOCOLS,
  CURVE_PROTOCOLS,
  normalizeProtocolKey,
  V2_PROTOCOLS,
  V3_PROTOCOLS,
} from "../protocols/classification.ts";

const ONE = 10n ** 18n;
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const DEFAULT_V2_FEE_NUMERATOR = 997n;
const DEFAULT_V2_FEE_DENOMINATOR = 1000n;

function normalizeTokenDecimalsList(tokens: any[], meta: any = {}) {
  const byAddress = meta?.tokenDecimalsByAddress ?? meta?.decimalsByAddress ?? null;
  const list = Array.isArray(meta?.tokenDecimals)
    ? meta.tokenDecimals
    : Array.isArray(meta?.decimals)
      ? meta.decimals
      : null;

  return tokens.map((token, index) => {
    const address = typeof token === "string" ? token.toLowerCase() : "";
    const raw = byAddress && typeof byAddress === "object"
      ? byAddress[address] ?? byAddress[token]
      : list?.[index];
    const decimals = Number(raw);
    return Number.isInteger(decimals) && decimals >= 0 && decimals <= 255 ? decimals : null;
  });
}

function defaultRatesForDecimals(decimals: Array<number | null>) {
  if (!Array.isArray(decimals) || decimals.some((value) => value == null)) return null;
  const maxDecimals = Math.max(...decimals.map((value) => value ?? 18), 18);
  if (maxDecimals > 59) return null;
  return decimals.map((value) => 10n ** BigInt(18 + maxDecimals - (value ?? 18)));
}

function splitEvenWeights(count: number) {
  if (!Number.isInteger(count) || count <= 0) return [];

  const base = ONE / BigInt(count);
  const weights = Array(count).fill(base);
  const allocated = base * BigInt(count);
  weights[count - 1] += ONE - allocated;
  return weights;
}

export function resolveV2FeeNumerator(meta: any = {}, fallback: bigint = DEFAULT_V2_FEE_NUMERATOR) {
  const rawFee = meta?.feeNumerator ?? meta?.fee;
  if (rawFee == null) return fallback;

  try {
    const fee = BigInt(rawFee);
    return fee > 0n && fee < DEFAULT_V2_FEE_DENOMINATOR ? fee : fallback;
  } catch {
    return fallback;
  }
}

export function resolveV3Fee(meta: any = {}, fallback: bigint = 3000n) {
  const rawFee = meta?.fee;
  if (rawFee == null) return fallback;

  try {
    const fee = BigInt(rawFee);
    return fee >= 0n ? fee : fallback;
  } catch {
    return fallback;
  }
}

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
  const feeNumerator = resolveV2FeeNumerator(meta);
  const normalizedTokens = Array.isArray(tokens) ? tokens.map((t: any) => String(t).toLowerCase()) : [];
  const tokenDecimals = normalizeTokenDecimalsList(normalizedTokens, meta);

  return {
    poolId: poolAddress.toLowerCase(),
    protocol,
    token0: (normalizedTokens[0] || "").toLowerCase(),
    token1: (normalizedTokens[1] || "").toLowerCase(),
    tokens: normalizedTokens,
    tokenDecimals,
    fee: feeNumerator,        // 997 = 0.3% fee (out of 1000)
    feeDenominator: DEFAULT_V2_FEE_DENOMINATOR,
    feeSource: meta?.feeNumerator != null || meta?.fee != null ? "metadata" : "default",
    reserve0: rawState.reserve0,
    reserve1: rawState.reserve1,
    blockTimestampLast: rawState.blockTimestampLast,
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
  const normalizedTokens = Array.isArray(tokens) ? tokens.map((t: any) => String(t).toLowerCase()) : [];
  const tokenDecimals = normalizeTokenDecimalsList(normalizedTokens, meta);
  const isAlgebra = rawState.isAlgebra === true || meta?.isAlgebra === true || protocol === "QUICKSWAP_V3";
  const fee = rawState.fee != null ? BigInt(rawState.fee) : resolveV3Fee(meta);
  return {
    poolId: poolAddress.toLowerCase(),
    protocol,
    token0: (normalizedTokens[0] || "").toLowerCase(),
    token1: (normalizedTokens[1] || "").toLowerCase(),
    tokens: normalizedTokens,
    tokenDecimals,
    fee,
    feeSource: rawState.fee != null ? "rpc" : meta?.fee != null ? "metadata" : "default",
    sqrtPriceX96: rawState.sqrtPriceX96,
    tick: rawState.tick,
    liquidity: rawState.liquidity,
    tickSpacing: rawState.tickSpacing,
    isAlgebra,
    isKyberElastic: rawState.isKyberElastic === true || meta?.isKyberElastic === true || protocol === "KYBERSWAP_ELASTIC",
    hydrationMode: rawState.hydrationMode ?? meta?.hydrationMode,
    ticks: rawState.ticks || new Map(),
    tickVersion: rawState.tickVersion ?? 0,
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
  const tokenDecimals = normalizeTokenDecimalsList(tokens, meta);
  const decimalRates = defaultRatesForDecimals(tokenDecimals);
  const rates = rawState.rates || decimalRates || defaultRates(n);
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
    tokenDecimals,
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
  const normalizedTokens = Array.isArray(tokens) ? tokens.map((t: any) => String(t).toLowerCase()) : [];
  const n = normalizedTokens.length;
  const toBigInt = (value: any, fallback = 0n): bigint => {
    if (typeof value === "bigint") return value;
    if (value == null) return fallback;
    try {
      return BigInt(value);
    } catch {
      return fallback;
    }
  };

  // Default: equal weights
  const weights = Array.isArray(rawState.weights)
    ? rawState.weights.map((value: any) => toBigInt(value))
    : Array.isArray(meta?.weights)
      ? meta.weights.map((value: any) => toBigInt(value))
      : splitEvenWeights(n);
  const swapFee = toBigInt(rawState.swapFee ?? meta?.swapFee ?? 3_000_000_000_000_000n);
  const balances = Array.isArray(rawState.balances)
    ? rawState.balances.map((value: any) => toBigInt(value))
    : [];
  const tokenDecimals = normalizeTokenDecimalsList(normalizedTokens, meta);

  return {
    poolId: poolAddress.toLowerCase(),
    balancerPoolId: rawState.poolId ?? meta?.poolId ?? meta?.pool_id ?? null,
    protocol,
    token0: (normalizedTokens[0] || "").toLowerCase(),
    token1: (normalizedTokens[1] || "").toLowerCase(),
    tokens: normalizedTokens,
    tokenDecimals,
    fee: swapFee,
    balances,
    weights,
    swapFee,
    swapFeeSource: rawState.swapFee != null ? "rpc" : meta?.swapFee != null ? "metadata" : "default",
    poolType: meta?.poolType ?? meta?.pool_type ?? null,
    specialization: rawState.specialization ?? meta?.specialization ?? null,
    lastChangeBlock: rawState.lastChangeBlock != null ? Number(rawState.lastChangeBlock) : null,
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
  const protocolKey = normalizeProtocolKey(protocol);
  let normalized = null;

  if (V2_PROTOCOLS.has(protocolKey)) {
    normalized = normalizeV2State(addr, protocolKey, tokens, rawState, meta);
  } else if (V3_PROTOCOLS.has(protocolKey)) {
    normalized = normalizeV3State(addr, protocolKey, tokens, rawState, meta);
  } else if (CURVE_PROTOCOLS.has(protocolKey)) {
    normalized = normalizeCurveState(addr, protocolKey, tokens, rawState, meta);
  } else if (BALANCER_PROTOCOLS.has(protocolKey)) {
    normalized = normalizeBalancerState(addr, protocolKey, tokens, rawState, meta);
  } else {
    console.warn(`[normalizer] Unknown protocol: ${protocol} for pool ${addr}`);
    return null;
  }

  const verdict = validatePoolState(normalized);
  if (!verdict.valid) {
    console.warn(`[normalizer] Rejecting invalid ${protocolKey} state for pool ${addr}: ${verdict.reason}`);
    return null;
  }

  return normalized;
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
  if (typeof state.poolId !== "string" || !ADDRESS_RE.test(state.poolId))
    return { valid: false, reason: "invalid poolId" };
  const seenTokens = new Set<string>();
  for (const token of state.tokens) {
    if (typeof token !== "string" || !ADDRESS_RE.test(token)) {
      return { valid: false, reason: `invalid token address: ${token}` };
    }
    const normalized = token.toLowerCase();
    if (seenTokens.has(normalized)) {
      return { valid: false, reason: `duplicate token: ${token}` };
    }
    seenTokens.add(normalized);
  }
  if (!Number.isFinite(Number(state.timestamp)) || Number(state.timestamp) <= 0)
    return { valid: false, reason: "invalid timestamp" };

  if (V2_PROTOCOLS.has(state.protocol)) {
    if (state.tokens.length !== 2)
      return { valid: false, reason: "V2: token count must be exactly 2" };
    if (state.reserve0 == null || state.reserve1 == null)
      return { valid: false, reason: "V2: missing reserves" };
    if (state.reserve0 <= 0n || state.reserve1 <= 0n)
      return { valid: false, reason: "V2: zero reserves" };
    if (state.fee == null || state.fee <= 0n || state.fee >= 1000n)
      return { valid: false, reason: "V2: invalid fee" };
    if (state.token0 && state.token0 !== state.tokens[0])
      return { valid: false, reason: "V2: token0 mismatch" };
    if (state.token1 && state.token1 !== state.tokens[1])
      return { valid: false, reason: "V2: token1 mismatch" };
  } else if (V3_PROTOCOLS.has(state.protocol)) {
    if (state.tokens.length !== 2)
      return { valid: false, reason: "V3: token count must be exactly 2" };
    if (!state.initialized)
      return { valid: false, reason: "V3: not initialized" };
    if (!state.sqrtPriceX96 || state.sqrtPriceX96 === 0n)
      return { valid: false, reason: "V3: zero sqrtPrice" };
    if (!Number.isInteger(state.tick) || state.tick < MIN_TICK || state.tick > MAX_TICK)
      return { valid: false, reason: "V3: invalid tick" };
    if (!state.liquidity || state.liquidity === 0n)
      return { valid: false, reason: "V3: zero liquidity" };
    if (
      state.tickSpacing != null &&
      (!Number.isInteger(state.tickSpacing) || state.tickSpacing <= 0)
    ) {
      return { valid: false, reason: "V3: invalid tickSpacing" };
    }
    if (state.fee == null || state.fee < 0n)
      return { valid: false, reason: "V3: invalid fee" };
    if (state.token0 && state.token0 !== state.tokens[0])
      return { valid: false, reason: "V3: token0 mismatch" };
    if (state.token1 && state.token1 !== state.tokens[1])
      return { valid: false, reason: "V3: token1 mismatch" };
    if (state.ticks != null && !(state.ticks instanceof Map))
      return { valid: false, reason: "V3: ticks must be a Map" };
    if (state.ticks instanceof Map) {
      for (const [tick, data] of state.ticks.entries()) {
        if (!Number.isInteger(tick) || tick < MIN_TICK || tick > MAX_TICK) {
          return { valid: false, reason: "V3: tick entry out of range" };
        }
        if (
          state.tickSpacing != null &&
          state.tickSpacing > 0 &&
          tick % state.tickSpacing !== 0
        ) {
          return { valid: false, reason: `V3: tick ${tick} misaligned with spacing` };
        }
        if (data?.liquidityGross == null || data.liquidityGross <= 0n) {
          return { valid: false, reason: `V3: invalid liquidityGross at tick ${tick}` };
        }
        if (data?.liquidityNet == null) {
          return { valid: false, reason: `V3: missing liquidityNet at tick ${tick}` };
        }
        if (data.liquidityNet > data.liquidityGross || data.liquidityNet < -data.liquidityGross) {
          return { valid: false, reason: `V3: liquidityNet exceeds gross at tick ${tick}` };
        }
      }
    }
  } else if (CURVE_PROTOCOLS.has(state.protocol)) {
    if (!state.balances || state.balances.length < 2)
      return { valid: false, reason: "Curve: missing balances" };
    if (state.balances.length !== state.tokens.length)
      return { valid: false, reason: "Curve: token/balance length mismatch" };
    if (state.balances.some((b: any) => b <= 0n))
      return { valid: false, reason: "Curve: zero balance" };
    if (!state.A || state.A <= 0n)
      return { valid: false, reason: "Curve: missing A" };
    if (!state.rates || state.rates.length !== state.balances.length)
      return { valid: false, reason: "Curve: invalid rates" };
    if (state.rates.some((r: any) => r <= 0n))
      return { valid: false, reason: "Curve: non-positive rate" };
    if (state.fee == null || state.fee < 0n)
      return { valid: false, reason: "Curve: invalid fee" };
  } else if (BALANCER_PROTOCOLS.has(state.protocol)) {
    if (!state.balances || state.balances.length < 2)
      return { valid: false, reason: "Balancer: missing balances" };
    if (!state.weights || state.weights.length < 2)
      return { valid: false, reason: "Balancer: missing weights" };
    if (state.balances.length !== state.weights.length)
      return { valid: false, reason: "Balancer: balances/weights length mismatch" };
    if (state.balances.length !== state.tokens.length)
      return { valid: false, reason: "Balancer: token count mismatch" };
    if (state.balances.some((b: any) => b <= 0n))
      return { valid: false, reason: "Balancer: zero balance" };
    if (state.weights.some((w: any) => w <= 0n))
      return { valid: false, reason: "Balancer: non-positive weight" };
    if (state.weights.reduce((sum: bigint, weight: bigint) => sum + weight, 0n) !== ONE)
      return { valid: false, reason: "Balancer: weights must sum to 1e18" };
    if (state.swapFee == null || state.swapFee < 0n || state.swapFee >= ONE)
      return { valid: false, reason: "Balancer: invalid swapFee" };
  }

  return { valid: true };
}

// ─── Protocol sets export ─────────────────────────────────────

export { V2_PROTOCOLS, V3_PROTOCOLS, CURVE_PROTOCOLS, BALANCER_PROTOCOLS };
