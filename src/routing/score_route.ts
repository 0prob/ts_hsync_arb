
/**
 * src/routing/score_route.js — Route scoring and ranking
 *
 * Assigns a numeric score to a simulated route result to enable
 * fast selection of the best opportunity before the full execution-grade
 * profitability checks in profit/compute.js.
 *
 * Scoring factors (weighted):
 *   1. Raw profit after a lightweight gas normalization
 *   2. Profit/input ratio (capital efficiency)
 *   3. Gas estimate (lower is better)
 *   4. Number of hops (fewer is safer)
 *   5. Cross-protocol diversity bonus
 *
 * The score is dimensionless and ranking-only.
 * Use profit/compute.js for absolute execution decisions.
 */

import { getPathHopCount } from "./path_hops.ts";

// ─── Gas cost helpers ─────────────────────────────────────────

/** Default MATIC gas price estimate (30 gwei) */
const DEFAULT_GAS_PRICE_GWEI = 30n;
const GWEI = 10n ** 9n;

function ceilDiv(numerator: bigint, denominator: bigint) {
  return (numerator + denominator - 1n) / denominator;
}

function bigintToApproxNumber(value: bigint, decimals = 0) {
  if (value === 0n) return 0;

  const negative = value < 0n;
  const abs = negative ? -value : value;
  const digits = abs.toString();
  const integerDigits = digits.length - decimals;

  if (integerDigits > 308) {
    return negative ? -Number.MAX_VALUE : Number.MAX_VALUE;
  }

  if (digits.length <= 15 + decimals) {
    const scaled = Number(abs) / 10 ** decimals;
    return negative ? -scaled : scaled;
  }

  const exponent = integerDigits - 1;
  const mantissaDigits = digits.slice(0, 15);
  const mantissa =
    mantissaDigits.length === 1
      ? mantissaDigits
      : `${mantissaDigits[0]}.${mantissaDigits.slice(1)}`;
  const approximate = Number(`${mantissa}e${exponent}`);
  return negative ? -approximate : approximate;
}

function scaledRatioToApproxNumber(
  numerator: bigint,
  denominator: bigint,
  scale = 1_000_000n,
) {
  if (denominator <= 0n) return -Infinity;
  return bigintToApproxNumber((numerator * scale) / denominator);
}

/**
 * Estimate gas cost in wei.
 *
 * @param {number} gasEstimate   Estimated gas units
 * @param {bigint} [gasPriceWei] Gas price in wei (default 30 gwei)
 * @returns {bigint}
 */
export function estimateGasCostWei(gasEstimate: number, gasPriceWei?: bigint) {
  const price = gasPriceWei ?? DEFAULT_GAS_PRICE_GWEI * GWEI;
  return BigInt(gasEstimate) * price;
}

export function gasCostInStartTokenUnits(gasCostWei: bigint, tokenToMaticRate?: bigint | null) {
  if (tokenToMaticRate == null) return null;
  if (tokenToMaticRate <= 0n) return null;
  return ceilDiv(gasCostWei, tokenToMaticRate);
}

// ─── Route scorer ─────────────────────────────────────────────

/**
 * @typedef {Object} ScoredRoute
 * @property {Object} path         ArbPath
 * @property {Object} result       RouteResult from simulateRoute
 * @property {bigint} netProfit    profit - gas cost
 * @property {number} score        Composite score (higher is better)
 * @property {number} roi          Profit / amountIn as a fraction * 1e6 (μ-units)
 */

/**
 * Score a single route result.
 *
 * @param {Object} path           ArbPath
 * @param {Object} result         RouteResult
 * @param {Object} [options]
 * @param {bigint} [options.gasPriceWei]     Gas price override
 * @param {bigint | null} [options.tokenToMaticRate]  1 raw start-token unit in MATIC wei
 * @param {bigint} [options.minNetProfit]    Reject routes with netProfit below this
 * @returns {ScoredRoute|null}    null if route fails minimum thresholds
 */
export function scoreRoute(path: RouteLike, result: RouteResultLike, options: ScoreOptions = {}): ScoredRoute | null {
  const { gasPriceWei, tokenToMaticRate = null, minNetProfit = 0n } = options;

  if (!result.profitable || result.profit <= 0n) return null;
  if (result.amountIn <= 0n) return null;
  if (tokenToMaticRate != null && tokenToMaticRate <= 0n) return null;

  const gasCostWei = estimateGasCostWei(result.totalGas, gasPriceWei);
  const gasCostInTokens = gasCostInStartTokenUnits(gasCostWei, tokenToMaticRate);

  // Ranking-only gas normalization. If we know the token/MATIC conversion,
  // compare in raw start-token units; otherwise leave profit untouched rather
  // than subtracting native wei from a non-native-token amount.
  const netProfit = gasCostInTokens == null ? result.profit : result.profit - gasCostInTokens;

  if (netProfit < minNetProfit) return null;

  // Prefer gas-normalized profitability when we can compare denominations safely.
  const roiProfit = gasCostInTokens == null ? result.profit : netProfit;
  const roi = scaledRatioToApproxNumber(roiProfit, result.amountIn);

  // Hop penalty: each additional hop reduces score
  const hopPenalty = (getPathHopCount(path) - 2) * 0.5;
  const gasPenalty = Math.max(0, result.totalGas - 90_000) / 100_000;

  // Protocol diversity bonus: cross-protocol arbs are harder to replicate
  const protocols = new Set(path.edges.map((e: { protocol: string }) => e.protocol));
  const diversityBonus = protocols.size > 1 ? 0.2 : 0;

  // Composite score: high gas-adjusted roi + high netProfit + diversity - hop/gas penalties
  // Normalize to a 0-100 range conceptually
  const score =
    roi * 0.6 +
    bigintToApproxNumber(netProfit, 12) * 0.3 +
    diversityBonus * 10 -
    hopPenalty * 5 -
    gasPenalty * 3;

  return { path, result, netProfit, score, roi, gasCostInTokens };
}

/**
 * Score and rank multiple route results.
 *
 * @param {Array<{ path: Object, result: Object }>} candidates
 * @param {Object} [options]
 * @param {bigint} [options.gasPriceWei]
 * @param {bigint | null} [options.tokenToMaticRate]
 * @param {bigint} [options.minNetProfit]
 * @returns {ScoredRoute[]}  Sorted descending by score
 */
export function rankRoutes(
  candidates: Array<{ path: RouteLike; result: RouteResultLike }>,
  options: ScoreOptions = {}
): ScoredRoute[] {
  const scored: ScoredRoute[] = [];

  for (const { path, result } of candidates) {
    const s = scoreRoute(path, result, options);
    if (s) scored.push(s);
  }

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

/**
 * Select the single best route from candidates.
 *
 * @param {Array<{ path: Object, result: Object }>} candidates
 * @param {Object} [options]
 * @returns {ScoredRoute|null}
 */
export function selectBestRoute(
  candidates: Array<{ path: RouteLike; result: RouteResultLike }>,
  options: ScoreOptions = {}
): ScoredRoute | null {
  const ranked = rankRoutes(candidates, options);
  return ranked.length > 0 ? ranked[0] : null;
}
type RouteLike = {
  hopCount: number;
  edges: Array<{ protocol: string }>;
};

type RouteResultLike = {
  profitable: boolean;
  profit: bigint;
  amountIn: bigint;
  totalGas: number;
};

type ScoreOptions = {
  gasPriceWei?: bigint;
  tokenToMaticRate?: bigint | null;
  minNetProfit?: bigint;
};

type ScoredRoute = {
  path: RouteLike;
  result: RouteResultLike;
  netProfit: bigint;
  score: number;
  roi: number;
  gasCostInTokens: bigint | null;
};
