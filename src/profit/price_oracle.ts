
/**
 * src/profit/price_oracle.js — Token-to-MATIC price oracle
 *
 * Provides real-time exchange rates between tokens and the native MATIC token.
 * Used to convert gas costs (in MATIC wei) into the start-token's raw units
 * for accurate net-profit calculation in compute.js.
 *
 * Rate semantics
 * ──────────────
 * Every stored rate answers: "how many MATIC wei is ONE RAW TOKEN UNIT worth?"
 *
 *   token     decimals  1 full token   1 raw unit
 *   ─────────────────────────────────────────────
 *   WMATIC       18     ≈ 1 MATIC      = 1 wei MATIC        → rate = 1
 *   USDC          6     ≈ 1 MATIC      = 1e12 wei MATIC     → rate = 1e12
 *   USDT          6     ≈ 1 MATIC      = 1e12 wei MATIC     → rate = 1e12
 *   WETH         18     ≈ 2500 MATIC   = 2500 wei MATIC     → rate = 2500
 *   DAI          18     ≈ 1 MATIC      = 1 wei MATIC        → rate = 1
 *
 * Usage (compute.js):
 *   gasCostInStartTokenUnits = gasCostWei / rate(startToken)
 *
 * Example — USDC start-token, gasCostWei = 2e16 (≈ 0.02 MATIC at 50 gwei):
 *   gasCostInTokens = 2e16 / 1e12 = 20_000 USDC units = 0.02 USDC ✓
 */

import { logger } from "../utils/logger.ts";
import { getPoolTokens } from "../util/pool_record.ts";

/** 1 MATIC in wei (used for V3 sqrtPriceX96 math only) */
const WEI = 10n ** 18n;
const RATE_SCALE = 10n ** 18n;

/** Q96 / Q192 constants for Uniswap V3 price decoding */
const Q192 = 2n ** 192n;

/**
 * Common anchor tokens on Polygon (Chain 137)
 */
export const TOKENS = {
  WMATIC: "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270",
  USDC:   "0x2791bca1f2de4661ed88a30c99a7a9449aa84174",  // USDC.e (bridged)
  USDC_N: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359",  // USDC (native)
  USDT:   "0xc2132d05d31c914a87c6611c10748aeb04b58e8f",
  WETH:   "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619",
  DAI:    "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063",
  WBTC:   "0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6",
};

type PoolStateLike = {
  reserve0?: bigint;
  reserve1?: bigint;
  sqrtPriceX96?: bigint;
};

/**
 * Fallback decimals for well-known Polygon tokens.
 * Used when the registry hasn't yet indexed a token's metadata.
 */
const KNOWN_DECIMALS = new Map([
  [TOKENS.WMATIC, 18],
  [TOKENS.USDC,   6],
  [TOKENS.USDC_N, 6],
  [TOKENS.USDT,   6],
  [TOKENS.WETH,   18],
  [TOKENS.DAI,    18],
  [TOKENS.WBTC,   8],
]);

const PIVOT_TOKENS = [
  TOKENS.USDC_N,
  TOKENS.USDC,
  TOKENS.WETH,
];

export class PriceOracle {
  private _cache: Map<string, any>;
  private _registry: any;
  private _updatedAt: number;
  private _updatedAtByToken: Map<string, number>;
  private _poolMeta: Map<string, any>;
  private _rates: Map<string, bigint>;

  constructor(stateCache: Map<string, any>, registry: any) {
    this._cache    = stateCache;
    this._registry = registry;
    this._updatedAt = 0;
    this._updatedAtByToken = new Map();
    this._poolMeta = new Map();
    this._rates = new Map();
    this._setDefaults();
  }

  _setDefaults() {
    // Fallback rates (updated by update() once live pool data is available).
    // rate = (1 full token in MATIC wei) / (10 ** decimals)
    this._rates.set(TOKENS.WMATIC, 1n);         // 1 wei WMATIC  = 1 wei MATIC
    this._rates.set(TOKENS.USDC,   10n ** 12n); // 1 USDC unit   ≈ 1e12 wei MATIC
    this._rates.set(TOKENS.USDC_N, 10n ** 12n); // native USDC — same rate
    this._rates.set(TOKENS.USDT,   10n ** 12n); // 1 USDT unit   ≈ 1e12 wei MATIC
    this._rates.set(TOKENS.WETH,   2500n);      // 1 WETH wei    ≈ 2500 wei MATIC
    this._rates.set(TOKENS.DAI,    1n);         // 1 DAI wei     ≈ 1 wei MATIC
    this._rates.set(TOKENS.WBTC,   600_000n);   // 1 WBTC sat    ≈ 6e5 wei MATIC (1 BTC ≈ 60k MATIC)
  }

  // ─── Public API ───────────────────────────────────────────────

  /**
   * Update rates from live pool state.
   *
   * Scans the state cache for WMATIC/-adjacent pairs and derives
   * decimal-adjusted prices. Prefers V2 pools (lower state complexity);
   * updates only improve on previous rate (never zeroes it out).
   */
  update(changedPools?: Iterable<string>) {
    const now = Date.now();
    let updatedCount = 0;
    let inspectedCount = 0;
    const pairQuotes = new Map<string, Map<string, bigint>>();

    // WMATIC is always 1:1 with MATIC (rate = 1)
    this._rates.set(TOKENS.WMATIC, 1n);
    this._updatedAtByToken.set(TOKENS.WMATIC, now);

    const entries = changedPools
      ? [...changedPools].map((addr) => [addr.toLowerCase(), this._cache.get(addr.toLowerCase())] as const)
      : this._cache.entries();

    for (const [addr, state] of entries) {
      if (!state) continue;
      let pool = this._poolMeta.get(addr);
      if (!pool) {
        pool = this._registry.getPoolMeta(addr);
        if (pool) this._poolMeta.set(addr, pool);
      }
      if (!pool) continue;

      const tokens = getPoolTokens(pool);
      if (!tokens || tokens.length !== 2) continue;
      inspectedCount++;

      const t0 = tokens[0].toLowerCase();
      const t1 = tokens[1].toLowerCase();
      const isWmatic0 = t0 === TOKENS.WMATIC;
      const isWmatic1 = t1 === TOKENS.WMATIC;
      const quote01 = this._deriveQuoteRateScaled(state, true);
      const quote10 = this._deriveQuoteRateScaled(state, false);
      this._storePairQuote(pairQuotes, t0, t1, quote01);
      this._storePairQuote(pairQuotes, t1, t0, quote10);

      if (isWmatic0) {
        const rate = this._scaledRateToWei(quote10);
        if (rate > 0n) {
          this._rates.set(t1, rate);
          this._updatedAtByToken.set(t1, now);
          updatedCount++;
        }
        continue;
      }
      if (isWmatic1) {
        const rate = this._scaledRateToWei(quote01);
        if (rate > 0n) {
          this._rates.set(t0, rate);
          this._updatedAtByToken.set(t0, now);
          updatedCount++;
        }
      }
    }

    for (const [token, quotes] of pairQuotes.entries()) {
      if (token === TOKENS.WMATIC) continue;

      for (const pivot of PIVOT_TOKENS) {
        const quoteToPivot = quotes.get(pivot) ?? 0n;
        const pivotRate = this._rates.get(pivot) ?? 0n;
        if (quoteToPivot <= 0n || pivotRate <= 0n) continue;

        const derived = this._scaledRateToWei((quoteToPivot * pivotRate) / RATE_SCALE);
        if (derived > 0n) {
          this._rates.set(token, derived);
          this._updatedAtByToken.set(token, now);
          updatedCount++;
          break;
        }
      }
    }

    if (updatedCount > 0 || !changedPools || inspectedCount > 0) {
      this._updatedAt = now;
    }
    if (updatedCount > 0) {
      logger.debug(`[price_oracle] Updated ${updatedCount} rates from state cache`);
    }

    return updatedCount;
  }

  /**
   * Get the rate for a token address.
   *
   * @param {string} tokenAddress  Lowercase token address
   * @returns {bigint}  MATIC wei per 1 raw token unit (0 if unknown)
   */
  getRate(tokenAddress: string) {
    return this._rates.get(tokenAddress.toLowerCase()) ?? 0n;
  }

  getFreshRate(tokenAddress: string, maxAgeMs = 30_000) {
    const key = tokenAddress.toLowerCase();
    const updatedAt = this._updatedAtByToken.get(key) ?? 0;
    if (updatedAt <= 0 || Date.now() - updatedAt > maxAgeMs) {
      return 0n;
    }
    return this._rates.get(key) ?? 0n;
  }

  isFresh(maxAgeMs = 30_000) {
    return this._updatedAt > 0 && Date.now() - this._updatedAt <= maxAgeMs;
  }

  /**
   * Convert an amount of token (in raw units) to MATIC wei.
   *
   * @param {string} tokenAddress
   * @param {bigint} amount  Raw token units (e.g. USDC in 1e-6 units)
   * @returns {bigint}  MATIC wei equivalent
   */
  toMatic(tokenAddress: string, amount: bigint) {
    const rate = this.getRate(tokenAddress);
    if (rate === 0n || amount === 0n) return 0n;
    return amount * rate;
  }

  /**
   * Convert a MATIC wei amount to raw token units.
   *
   * Used by compute.js to convert gas costs into start-token units.
   *
   * @param {string} tokenAddress
   * @param {bigint} maticWei
   * @returns {bigint}  Raw token units (floor division)
   */
  fromMatic(tokenAddress: string, maticWei: bigint) {
    const rate = this.getRate(tokenAddress);
    if (rate === 0n || maticWei === 0n) return 0n;
    return maticWei / rate;
  }

  // ─── Internal ─────────────────────────────────────────────────

  /**
   * Resolve token decimals.
   * Checks: known fallback table → registry token_meta.
   *
   * @param {string} tokenAddress  Lowercase address
   * @returns {number|null}
   */
  _getDecimals(tokenAddress: string) {
    if (KNOWN_DECIMALS.has(tokenAddress)) {
      return KNOWN_DECIMALS.get(tokenAddress);
    }
    const meta = this._registry.getTokenMeta?.(tokenAddress);
    if (meta?.decimals != null) return meta.decimals;
    return null;
  }

  /**
   * Derive rate from a pool state snapshot.
   *
   * Rate = "how many MATIC wei is 1 raw unit of `otherToken` worth?"
   *
   * For a WMATIC/Token pool:
   *   V2:  rateRaw = r_wmatic / r_token   (raw reserves ratio)
   *   V3:  rateRaw derived from sqrtPriceX96
   *
   * Then adjust for decimal difference:
   *   If WMATIC is token0 and Token is token1 (18 dec each):
   *     1 raw token unit = r0/r1 raw WMATIC units = r0/r1 wei MATIC  → no decimal adjustment needed
   *   If WMATIC is token0 (18 dec) and Token is token1 (6 dec, USDC):
   *     Reserves in raw units: r0 (wei) and r1 (1e-6 USDC)
   *     1 raw USDC unit = r0 / r1 raw WMATIC units = r0/r1 wei MATIC
   *     Example: r0 = 500k * 1e18, r1 = 500k * 1e6
   *       1 USDC unit = (500k * 1e18) / (500k * 1e6) = 1e12 wei MATIC ✓
   *   No separate decimal adjustment is needed — the raw reserve ratio
   *   already captures the decimal difference because r0 and r1 are
   *   stored in their respective token's raw units.
   *
   * @param {Object}  state        Canonical pool state
   * @param {boolean} isWmatic0    True if WMATIC is token0
   * @param {number}  _otherDec    Decimals of the other token (unused — for docs)
   * @returns {bigint}  Rate or 0n if not derivable
   */
  _storePairQuote(pairQuotes: Map<string, Map<string, bigint>>, base: string, quote: string, scaledRate: bigint) {
    if (scaledRate <= 0n) return;
    const baseKey = base.toLowerCase();
    const quoteKey = quote.toLowerCase();
    if (!pairQuotes.has(baseKey)) pairQuotes.set(baseKey, new Map());
    const quotes = pairQuotes.get(baseKey)!;
    const existing = quotes.get(quoteKey) ?? 0n;
    if (existing === 0n || scaledRate < existing) {
      quotes.set(quoteKey, scaledRate);
    }
  }

  _scaledRateToWei(rateScaled: bigint) {
    if (rateScaled <= 0n) return 0n;
    const floored = rateScaled / RATE_SCALE;
    return floored > 0n ? floored : 1n;
  }

  _deriveQuoteRateScaled(state: PoolStateLike, token0AsBase: boolean) {
    try {
      // ── Uniswap V2 ──────────────────────────────────────────
      if (state.reserve0 !== undefined && state.reserve1 !== undefined) {
        const r0 = state.reserve0;
        const r1 = state.reserve1;
        if (r0 === 0n || r1 === 0n) return 0n;

        return token0AsBase
          ? (r1 * RATE_SCALE) / r0
          : (r0 * RATE_SCALE) / r1;
      }

      // ── Uniswap V3 ──────────────────────────────────────────
      // sqrtPriceX96 encodes: sqrt(rawToken1 / rawToken0) * 2^96
      // priceX192 = rawToken1 / rawToken0  (as a Q192 fixed-point integer)
      if (state.sqrtPriceX96 !== undefined) {
        const sqrtP = BigInt(state.sqrtPriceX96);
        if (sqrtP === 0n) return 0n;
        const priceX192 = sqrtP * sqrtP; // = (token1/token0) * 2^192

        return token0AsBase
          ? (priceX192 * RATE_SCALE) / Q192
          : (Q192 * RATE_SCALE) / priceX192;
      }
    } catch {
      return 0n;
    }
    return 0n;
  }
}
