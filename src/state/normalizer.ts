
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
import { MIN_TICK, MAX_TICK, MIN_SQRT_RATIO, MAX_SQRT_RATIO } from "../math/tick_math.ts";
import {
  BALANCER_PROTOCOLS,
  CURVE_PROTOCOLS,
  DODO_PROTOCOLS,
  normalizeProtocolKey,
  V2_PROTOCOLS,
  V3_PROTOCOLS,
  WOOFI_PROTOCOLS,
} from "../protocols/classification.ts";
import { normalizeEvmAddress } from "../util/pool_record.ts";

const ONE = 10n ** 18n;
const DEFAULT_V2_FEE_NUMERATOR = 997n;
const DEFAULT_V2_FEE_DENOMINATOR = 1000n;

function normalizeStateAddress(value: unknown) {
  return normalizeEvmAddress(value);
}

function normalizeStateTokenList(tokens: unknown) {
  if (!Array.isArray(tokens)) return [];
  return tokens
    .map(normalizeStateAddress)
    .filter((token): token is string => token != null);
}

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

function normalizeBigIntList(values: unknown, length: number) {
  if (!Array.isArray(values) || values.length !== length) return null;
  const out: bigint[] = [];
  for (const value of values) {
    try {
      out.push(BigInt(value as any));
    } catch {
      return null;
    }
  }
  return out;
}

export function resolveV2FeeDenominator(meta: any = {}, fallback: bigint = DEFAULT_V2_FEE_DENOMINATOR) {
  const rawDenominator = meta?.feeDenominator ?? meta?.fee_denominator;
  if (rawDenominator == null) return fallback;

  try {
    const denominator = BigInt(rawDenominator);
    return denominator > 0n ? denominator : fallback;
  } catch {
    return fallback;
  }
}

export function resolveV2FeeNumerator(
  meta: any = {},
  fallback: bigint = DEFAULT_V2_FEE_NUMERATOR,
  denominator: bigint = resolveV2FeeDenominator(meta),
) {
  const rawFee = meta?.feeNumerator ?? meta?.fee;
  if (rawFee == null) return fallback;

  try {
    const fee = BigInt(rawFee);
    return fee > 0n && fee < denominator ? fee : fallback;
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

function optionalNonNegativeBigInt(value: unknown) {
  if (value == null) return null;
  try {
    const normalized = BigInt(value as any);
    return normalized >= 0n ? normalized : null;
  } catch {
    return null;
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
  const feeDenominator = resolveV2FeeDenominator(meta);
  const feeNumerator = resolveV2FeeNumerator(meta, DEFAULT_V2_FEE_NUMERATOR, feeDenominator);
  const poolId = normalizeStateAddress(poolAddress) ?? "";
  const normalizedTokens = normalizeStateTokenList(tokens);
  const tokenDecimals = normalizeTokenDecimalsList(normalizedTokens, meta);

  return {
    poolId,
    protocol,
    token0: (normalizedTokens[0] || "").toLowerCase(),
    token1: (normalizedTokens[1] || "").toLowerCase(),
    tokens: normalizedTokens,
    tokenDecimals,
    fee: feeNumerator,        // 997 = 0.3% fee (out of 1000)
    feeDenominator,
    feeSource: meta?.feeNumerator != null || meta?.fee != null || meta?.feeDenominator != null || meta?.fee_denominator != null ? "metadata" : "default",
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
  const poolId = normalizeStateAddress(poolAddress) ?? "";
  const protocolKey = normalizeProtocolKey(protocol);
  const normalizedTokens = normalizeStateTokenList(tokens);
  const tokenDecimals = normalizeTokenDecimalsList(normalizedTokens, meta);
  const isKyberElastic = rawState.isKyberElastic === true || meta?.isKyberElastic === true || protocolKey === "KYBERSWAP_ELASTIC";
  const isAlgebra = rawState.isAlgebra === true || meta?.isAlgebra === true || protocolKey === "QUICKSWAP_V3";
  const swapFeeBps = isKyberElastic
    ? optionalNonNegativeBigInt(rawState.swapFeeBps) ??
      optionalNonNegativeBigInt(meta?.swapFeeBps) ??
      optionalNonNegativeBigInt(meta?.swapFeeUnits)
    : null;
  const fee = rawState.fee != null
    ? BigInt(rawState.fee)
    : isKyberElastic && swapFeeBps != null
      ? swapFeeBps * 100n
      : resolveV3Fee(meta);
  return {
    poolId,
    protocol: protocolKey,
    token0: (normalizedTokens[0] || "").toLowerCase(),
    token1: (normalizedTokens[1] || "").toLowerCase(),
    tokens: normalizedTokens,
    tokenDecimals,
    fee,
    ...(swapFeeBps != null ? { swapFeeBps } : {}),
    feeSource: rawState.fee != null ? "rpc" : meta?.fee != null || swapFeeBps != null ? "metadata" : "default",
    sqrtPriceX96: rawState.sqrtPriceX96,
    tick: rawState.tick,
    liquidity: rawState.liquidity,
    tickSpacing: rawState.tickSpacing,
    isAlgebra,
    isKyberElastic,
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
  const poolId = normalizeStateAddress(poolAddress) ?? "";
  const normalizedTokens = normalizeStateTokenList(tokens);
  const n = normalizedTokens.length;
  const tokenDecimals = normalizeTokenDecimalsList(normalizedTokens, meta);
  const decimalRates = defaultRatesForDecimals(tokenDecimals);
  const rates = normalizeBigIntList(rawState.rates, n) ?? decimalRates ?? defaultRates(n);
  const balances = normalizeBigIntList(rawState.balances, n) ?? [];
  const A = rawState.A || BigInt(meta?.A || 100) * 100n; // A in A_PRECISION units

  return {
    poolId,
    protocol,
    token0: (normalizedTokens[0] || "").toLowerCase(),
    token1: (normalizedTokens[1] || "").toLowerCase(),
    tokens: normalizedTokens,
    fee: rawState.fee || BigInt(meta?.fee || 4_000_000n),  // default 0.04% in 1e10
    balances,
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
  const poolId = normalizeStateAddress(poolAddress) ?? "";
  const normalizedTokens = normalizeStateTokenList(tokens);
  const toBigInt = (value: any, fallback = 0n): bigint => {
    if (typeof value === "bigint") return value;
    if (value == null) return fallback;
    try {
      return BigInt(value);
    } catch {
      return fallback;
    }
  };
  const poolType = rawState.poolType ?? meta?.poolType ?? meta?.pool_type ?? null;
  const isStable = rawState.isStable === true ||
    rawState.amp != null ||
    (typeof poolType === "string" && poolType.toLowerCase().includes("stable"));

  const weights = Array.isArray(rawState.weights)
    ? rawState.weights.map((value: any) => toBigInt(value))
    : Array.isArray(meta?.weights)
      ? meta.weights.map((value: any) => toBigInt(value))
      : [];
  const swapFee = toBigInt(rawState.swapFee ?? meta?.swapFee ?? 3_000_000_000_000_000n);
  const balances = Array.isArray(rawState.balances)
    ? rawState.balances.map((value: any) => toBigInt(value))
    : [];
  const scalingFactors = Array.isArray(rawState.scalingFactors)
    ? rawState.scalingFactors.map((value: any) => toBigInt(value))
    : Array.isArray(meta?.scalingFactors)
      ? meta.scalingFactors.map((value: any) => toBigInt(value))
      : [];
  const tokenDecimals = normalizeTokenDecimalsList(normalizedTokens, meta);

  return {
    poolId,
    balancerPoolId: rawState.poolId ?? meta?.poolId ?? meta?.pool_id ?? null,
    protocol,
    token0: (normalizedTokens[0] || "").toLowerCase(),
    token1: (normalizedTokens[1] || "").toLowerCase(),
    tokens: normalizedTokens,
    tokenDecimals,
    fee: swapFee,
    balances,
    weights,
    scalingFactors,
    amp: rawState.amp != null ? toBigInt(rawState.amp) : meta?.amp != null ? toBigInt(meta.amp) : null,
    ampPrecision: rawState.ampPrecision != null
      ? toBigInt(rawState.ampPrecision, 1000n)
      : meta?.ampPrecision != null
        ? toBigInt(meta.ampPrecision, 1000n)
        : null,
    ampIsUpdating: Boolean(rawState.ampIsUpdating ?? meta?.ampIsUpdating ?? false),
    swapFee,
    swapFeeSource: rawState.swapFee != null ? "rpc" : meta?.swapFee != null ? "metadata" : "default",
    poolType,
    isStable,
    bptIndex: rawState.bptIndex ?? meta?.bptIndex ?? null,
    specialization: rawState.specialization ?? meta?.specialization ?? null,
    lastChangeBlock: rawState.lastChangeBlock != null ? Number(rawState.lastChangeBlock) : null,
    timestamp: rawState.fetchedAt || Date.now(),
  };
}

/**
 * Normalize a DODO V2 PMM pool state.
 */
export function normalizeDodoState(poolAddress: any, protocol: any, tokens: any, rawState: any, meta: any = {}) {
  const poolId = normalizeStateAddress(poolAddress) ?? "";
  const protocolKey = normalizeProtocolKey(protocol);
  const fallbackTokens = normalizeStateTokenList(tokens);
  const baseToken = normalizeStateAddress(rawState.baseToken ?? meta?.baseToken ?? fallbackTokens[0]);
  const quoteToken = normalizeStateAddress(rawState.quoteToken ?? meta?.quoteToken ?? fallbackTokens[1]);
  const normalizedTokens = baseToken && quoteToken
    ? [baseToken, quoteToken]
    : fallbackTokens;
  const tokenDecimals = normalizeTokenDecimalsList(normalizedTokens, meta);
  const toBigInt = (value: any, fallback = 0n): bigint => {
    if (typeof value === "bigint") return value;
    if (value == null) return fallback;
    try {
      return BigInt(value);
    } catch {
      return fallback;
    }
  };

  return {
    poolId,
    protocol: protocolKey,
    token0: (normalizedTokens[0] || "").toLowerCase(),
    token1: (normalizedTokens[1] || "").toLowerCase(),
    tokens: normalizedTokens,
    tokenDecimals,
    fee: toBigInt(rawState.lpFeeRate) + toBigInt(rawState.mtFeeRate),
    baseToken: baseToken ?? "",
    quoteToken: quoteToken ?? "",
    baseReserve: toBigInt(rawState.baseReserve ?? rawState.B),
    quoteReserve: toBigInt(rawState.quoteReserve ?? rawState.Q),
    baseTarget: toBigInt(rawState.baseTarget ?? rawState.B0),
    quoteTarget: toBigInt(rawState.quoteTarget ?? rawState.Q0),
    i: toBigInt(rawState.i),
    k: toBigInt(rawState.k ?? rawState.K),
    rState: Number(rawState.rState ?? rawState.R ?? 0),
    lpFeeRate: toBigInt(rawState.lpFeeRate),
    mtFeeRate: toBigInt(rawState.mtFeeRate),
    feeSource: rawState.feeSource ?? meta?.feeSource ?? null,
    poolType: meta?.poolType ?? meta?.pool_type ?? null,
    timestamp: rawState.fetchedAt || Date.now(),
  };
}

/**
 * Normalize a WOOFi WooPPV2 singleton state.
 */
export function normalizeWoofiState(poolAddress: any, protocol: any, tokens: any, rawState: any, meta: any = {}) {
  const poolId = normalizeStateAddress(poolAddress) ?? "";
  const protocolKey = normalizeProtocolKey(protocol);
  const fallbackTokens = normalizeStateTokenList(tokens);
  const quoteToken = normalizeStateAddress(rawState.quoteToken ?? meta?.quoteToken ?? fallbackTokens[0]);
  const rawBaseStates = Array.isArray(rawState.baseStates)
    ? rawState.baseStates
    : rawState.baseTokenStates && typeof rawState.baseTokenStates === "object"
      ? Object.values(rawState.baseTokenStates)
      : [];
  const baseStates = new Map<string, any>();
  const toBigInt = (value: any, fallback = 0n): bigint => {
    if (typeof value === "bigint") return value;
    if (value == null) return fallback;
    try {
      return BigInt(value);
    } catch {
      return fallback;
    }
  };
  const toInteger = (value: any, fallback = 0) => {
    if (value == null) return fallback;
    const numeric = Number(value);
    return Number.isInteger(numeric) && numeric >= 0 ? numeric : fallback;
  };
  const pow10 = (value: any) => {
    const decimals = toInteger(value, 0);
    return decimals <= 38 ? 10n ** BigInt(decimals) : 1n;
  };
  const fallbackDecimals = normalizeTokenDecimalsList(fallbackTokens, meta);

  for (const entry of rawBaseStates) {
    const token = normalizeStateAddress(entry?.token ?? entry?.baseToken);
    if (!token || token === quoteToken) continue;
    const fallbackIndex = fallbackTokens.indexOf(token);
    const baseDecimals = toInteger(entry?.baseDecimals ?? fallbackDecimals[fallbackIndex], 18);
    const quoteDecimals = toInteger(entry?.quoteDecimals ?? rawState.quoteDecimals ?? fallbackDecimals[0], 18);
    const priceDecimals = toInteger(entry?.priceDecimals, 8);
    baseStates.set(token, {
      token,
      reserve: toBigInt(entry?.reserve),
      feeRate: toBigInt(entry?.feeRate),
      maxGamma: toBigInt(entry?.maxGamma),
      maxNotionalSwap: toBigInt(entry?.maxNotionalSwap),
      price: toBigInt(entry?.price),
      spread: toBigInt(entry?.spread),
      coeff: toBigInt(entry?.coeff),
      feasible: entry?.feasible !== false && entry?.woFeasible !== false,
      baseDecimals,
      quoteDecimals,
      priceDecimals,
      baseDec: toBigInt(entry?.baseDec, pow10(baseDecimals)),
      quoteDec: toBigInt(entry?.quoteDec, pow10(quoteDecimals)),
      priceDec: toBigInt(entry?.priceDec, pow10(priceDecimals)),
    });
  }

  const normalizedTokens = quoteToken
    ? [
        quoteToken,
        ...fallbackTokens
          .filter((token) => token !== quoteToken && baseStates.has(token)),
        ...[...baseStates.keys()].filter((token) => !fallbackTokens.includes(token)),
      ]
    : fallbackTokens;
  const dedupedTokens = [...new Set(normalizedTokens)];
  const tokenDecimals = dedupedTokens.map((token, index) => {
    if (token === quoteToken) return toInteger(rawState.quoteDecimals ?? fallbackDecimals[index], 18);
    return baseStates.get(token)?.baseDecimals ?? fallbackDecimals[index] ?? 18;
  });
  const baseTokenStates = Object.fromEntries(baseStates.entries());
  const balances = dedupedTokens.map((token) =>
    token === quoteToken
      ? toBigInt(rawState.quoteReserve)
      : toBigInt(baseTokenStates[token]?.reserve)
  );

  return {
    poolId,
    protocol: protocolKey,
    token0: (dedupedTokens[0] || "").toLowerCase(),
    token1: (dedupedTokens[1] || "").toLowerCase(),
    tokens: dedupedTokens,
    tokenDecimals,
    fee: dedupedTokens.slice(1).reduce((max, token) => {
      const feeRate = toBigInt(baseTokenStates[token]?.feeRate);
      return feeRate > max ? feeRate : max;
    }, 0n),
    feeDenominator: 100_000n,
    quoteToken: quoteToken ?? "",
    quoteReserve: toBigInt(rawState.quoteReserve),
    quoteFeeRate: toBigInt(rawState.quoteFeeRate),
    quoteDecimals: toInteger(rawState.quoteDecimals ?? tokenDecimals[0], 18),
    quoteDec: toBigInt(rawState.quoteDec, pow10(rawState.quoteDecimals ?? tokenDecimals[0] ?? 18)),
    wooracle: normalizeStateAddress(rawState.wooracle ?? meta?.wooracle),
    router: normalizeStateAddress(rawState.router ?? meta?.router),
    wooPP: normalizeStateAddress(rawState.wooPP ?? meta?.wooPP ?? poolId),
    baseTokenStates,
    balances,
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

  const addr = normalizeStateAddress(poolAddress);
  if (!addr) {
    console.warn(`[normalizer] Rejecting invalid pool address for protocol ${protocol}: ${String(poolAddress)}`);
    return null;
  }
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
  } else if (DODO_PROTOCOLS.has(protocolKey)) {
    normalized = normalizeDodoState(addr, protocolKey, tokens, rawState, meta);
  } else if (WOOFI_PROTOCOLS.has(protocolKey)) {
    normalized = normalizeWoofiState(addr, protocolKey, tokens, rawState, meta);
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
  if (normalizeStateAddress(state.poolId) !== state.poolId)
    return { valid: false, reason: "invalid poolId" };
  const seenTokens = new Set<string>();
  for (const token of state.tokens) {
    const normalizedToken = normalizeStateAddress(token);
    if (normalizedToken == null || normalizedToken !== token) {
      return { valid: false, reason: `invalid token address: ${token}` };
    }
    if (seenTokens.has(normalizedToken)) {
      return { valid: false, reason: `duplicate token: ${token}` };
    }
    seenTokens.add(normalizedToken);
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
    const feeDenominator = state.feeDenominator != null ? BigInt(state.feeDenominator) : DEFAULT_V2_FEE_DENOMINATOR;
    if (feeDenominator <= 0n || state.fee == null || state.fee <= 0n || state.fee >= feeDenominator)
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
    if (
      !state.sqrtPriceX96 ||
      state.sqrtPriceX96 < MIN_SQRT_RATIO ||
      state.sqrtPriceX96 >= MAX_SQRT_RATIO
    )
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
    if (state.fee == null || state.fee < 0n || state.fee >= 1_000_000n)
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
    if (state.fee == null || state.fee < 0n || state.fee >= 10n ** 10n)
      return { valid: false, reason: "Curve: invalid fee" };
  } else if (BALANCER_PROTOCOLS.has(state.protocol)) {
    if (!state.balances || state.balances.length < 2)
      return { valid: false, reason: "Balancer: missing balances" };
    if (state.balances.length !== state.tokens.length)
      return { valid: false, reason: "Balancer: token count mismatch" };
    if (state.balances.some((b: any) => b <= 0n))
      return { valid: false, reason: "Balancer: zero balance" };
    if (state.swapFee == null || state.swapFee < 0n || state.swapFee >= ONE)
      return { valid: false, reason: "Balancer: invalid swapFee" };
    if (state.isStable === true) {
      if (state.amp == null || state.amp <= 0n)
        return { valid: false, reason: "Balancer stable: missing amp" };
      if (state.ampPrecision == null || state.ampPrecision <= 0n)
        return { valid: false, reason: "Balancer stable: invalid amp precision" };
      if (!Array.isArray(state.scalingFactors) || state.scalingFactors.length !== state.balances.length)
        return { valid: false, reason: "Balancer stable: scaling factor length mismatch" };
      if (state.scalingFactors.some((factor: any) => factor <= 0n))
        return { valid: false, reason: "Balancer stable: non-positive scaling factor" };
    } else {
      if (!state.weights || state.weights.length < 2)
        return { valid: false, reason: "Balancer: missing weights" };
      if (state.balances.length !== state.weights.length)
        return { valid: false, reason: "Balancer: balances/weights length mismatch" };
      if (state.weights.some((w: any) => w <= 0n))
        return { valid: false, reason: "Balancer: non-positive weight" };
      if (state.weights.reduce((sum: bigint, weight: bigint) => sum + weight, 0n) !== ONE)
        return { valid: false, reason: "Balancer: weights must sum to 1e18" };
    }
  } else if (DODO_PROTOCOLS.has(state.protocol)) {
    if (state.tokens.length !== 2)
      return { valid: false, reason: "DODO: token count must be exactly 2" };
    if (state.baseToken !== state.tokens[0] || state.quoteToken !== state.tokens[1])
      return { valid: false, reason: "DODO: base/quote token mismatch" };
    if (state.baseReserve == null || state.quoteReserve == null)
      return { valid: false, reason: "DODO: missing reserves" };
    if (state.baseReserve <= 0n || state.quoteReserve <= 0n)
      return { valid: false, reason: "DODO: zero reserves" };
    if (state.baseTarget == null || state.quoteTarget == null)
      return { valid: false, reason: "DODO: missing targets" };
    if (state.baseTarget <= 0n || state.quoteTarget <= 0n)
      return { valid: false, reason: "DODO: zero targets" };
    if (state.i == null || state.i <= 0n)
      return { valid: false, reason: "DODO: invalid oracle price" };
    if (state.k == null || state.k < 0n || state.k > ONE)
      return { valid: false, reason: "DODO: invalid k" };
    if (!Number.isInteger(state.rState) || state.rState < 0 || state.rState > 2)
      return { valid: false, reason: "DODO: invalid R state" };
    if (state.lpFeeRate == null || state.mtFeeRate == null)
      return { valid: false, reason: "DODO: missing fee rates" };
    if (state.lpFeeRate < 0n || state.mtFeeRate < 0n || state.lpFeeRate + state.mtFeeRate >= ONE)
      return { valid: false, reason: "DODO: invalid fee rates" };
  } else if (WOOFI_PROTOCOLS.has(state.protocol)) {
    if (state.tokens.length < 2)
      return { valid: false, reason: "WOOFi: token count must be at least 2" };
    if (state.quoteToken !== state.tokens[0])
      return { valid: false, reason: "WOOFi: quote token must be token0" };
    if (state.quoteReserve == null || state.quoteReserve <= 0n)
      return { valid: false, reason: "WOOFi: invalid quote reserve" };
    if (!state.balances || state.balances.length !== state.tokens.length)
      return { valid: false, reason: "WOOFi: token/balance length mismatch" };
    if (state.balances.some((b: any) => b <= 0n))
      return { valid: false, reason: "WOOFi: zero balance" };
    if (!state.baseTokenStates || typeof state.baseTokenStates !== "object")
      return { valid: false, reason: "WOOFi: missing base token states" };
    for (const token of state.tokens.slice(1)) {
      const base = state.baseTokenStates[token];
      if (!base) return { valid: false, reason: `WOOFi: missing base state for ${token}` };
      if (base.reserve == null || base.reserve <= 0n)
        return { valid: false, reason: `WOOFi: invalid reserve for ${token}` };
      if (base.price == null || base.price <= 0n)
        return { valid: false, reason: `WOOFi: invalid price for ${token}` };
      if (base.feasible === false)
        return { valid: false, reason: `WOOFi: infeasible oracle for ${token}` };
      if (base.spread == null || base.spread < 0n || base.spread >= ONE)
        return { valid: false, reason: `WOOFi: invalid spread for ${token}` };
      if (base.coeff == null || base.coeff < 0n)
        return { valid: false, reason: `WOOFi: invalid coeff for ${token}` };
      if (base.feeRate == null || base.feeRate < 0n || base.feeRate >= 100_000n)
        return { valid: false, reason: `WOOFi: invalid fee rate for ${token}` };
      if (base.maxGamma == null || base.maxGamma < 0n)
        return { valid: false, reason: `WOOFi: invalid maxGamma for ${token}` };
      if (base.maxNotionalSwap == null || base.maxNotionalSwap <= 0n)
        return { valid: false, reason: `WOOFi: invalid maxNotionalSwap for ${token}` };
      if (base.baseDec == null || base.baseDec <= 0n || base.quoteDec == null || base.quoteDec <= 0n || base.priceDec == null || base.priceDec <= 0n)
        return { valid: false, reason: `WOOFi: invalid decimals for ${token}` };
    }
  }

  return { valid: true };
}

// ─── Protocol sets export ─────────────────────────────────────

export { V2_PROTOCOLS, V3_PROTOCOLS, CURVE_PROTOCOLS, BALANCER_PROTOCOLS, DODO_PROTOCOLS, WOOFI_PROTOCOLS };
