
/**
 * src/routing/score_route.js — Route scoring and ranking
 *
 * Assigns a numeric score to a simulated route result to enable
 * fast selection of the best opportunity without running a full
 * profitability calculation.
 *
 * Scoring factors (weighted):
 *   1. Raw profit (after gas estimate)
 *   2. Profit/input ratio (capital efficiency)
 *   3. Gas estimate (lower is better)
 *   4. Number of hops (fewer is safer)
 *   5. Cross-protocol diversity bonus
 *
 * The score is dimensionless — only useful for relative ranking.
 * Use profit/compute.js for absolute profitability decisions.
 */

// ─── Gas cost helpers ─────────────────────────────────────────

/** Default MATIC gas price estimate (30 gwei) */
const DEFAULT_GAS_PRICE_GWEI = 30n;
const GWEI = 10n ** 9n;
const WEI = 1n;

/**
 * Estimate gas cost in wei.
 *
 * @param {number} gasEstimate   Estimated gas units
 * @param {bigint} [gasPriceWei] Gas price in wei (default 30 gwei)
 * @returns {bigint}
 */
export function estimateGasCostWei(gasEstimate, gasPriceWei) {
  const price = gasPriceWei ?? DEFAULT_GAS_PRICE_GWEI * GWEI;
  return BigInt(gasEstimate) * price;
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
 * @param {bigint} [options.minNetProfit]    Reject routes with netProfit below this
 * @returns {ScoredRoute|null}    null if route fails minimum thresholds
 */
export function scoreRoute(path, result, options = {}) {
  const { gasPriceWei, minNetProfit = 0n } = options;

  if (!result.profitable || result.profit <= 0n) return null;
  if (result.amountIn <= 0n) return null;

  // Gas cost in wei
  const gasCostWei = estimateGasCostWei(result.totalGas, gasPriceWei);

  // Net profit (profit - gas cost). Both in the start token's raw units.
  // NOTE: Gas cost is in MATIC/wei which may not be the same denomination
  // as profit (which is in the start token's units). For a precise comparison,
  // profit must be converted to MATIC at current price. Here we use a
  // simplified approach: if start token is WMATIC (native), they're directly
  // comparable. For USDC/WETH, the caller should pass an appropriate offset.
  // The absolute netProfit is still useful for relative ranking.
  const netProfit = result.profit - gasCostWei;

  if (netProfit < minNetProfit) return null;

  // ROI in μ-units (micro): (profit / amountIn) * 1e6
  const roi = Number((result.profit * 1_000_000n) / result.amountIn);

  // Hop penalty: each additional hop reduces score
  const hopPenalty = (path.hopCount - 2) * 0.5;

  // Protocol diversity bonus: cross-protocol arbs are harder to replicate
  const protocols = new Set(path.edges.map((e) => e.protocol));
  const diversityBonus = protocols.size > 1 ? 0.2 : 0;

  // Composite score: high roi + high netProfit + diversity - hop penalty
  // Normalize to a 0-100 range conceptually
  const score =
    roi * 0.6 +
    Number(netProfit) / 1e12 * 0.3 +  // scale down wei
    diversityBonus * 10 -
    hopPenalty * 5;

  return { path, result, netProfit, score, roi };
}

/**
 * Score and rank multiple route results.
 *
 * @param {Array<{ path: Object, result: Object }>} candidates
 * @param {Object} [options]
 * @param {bigint} [options.gasPriceWei]
 * @param {bigint} [options.minNetProfit]
 * @returns {ScoredRoute[]}  Sorted descending by score
 */
export function rankRoutes(candidates, options = {}) {
  const scored = [];

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
export function selectBestRoute(candidates, options = {}) {
  const ranked = rankRoutes(candidates, options);
  return ranked.length > 0 ? ranked[0] : null;
}
