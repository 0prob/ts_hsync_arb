
import { getResultHopCount } from "../routing/path_hops.ts";

/**
 * src/profit/compute.js — Gas-adjusted profitability engine
 *
 * Determines whether a simulated arbitrage route is worth executing
 * after accounting for:
 *   1. Gas cost (in the network's native token, MATIC)
 *   2. Slippage risk (difference between simulated and real output)
 *   3. Revert risk (probability of on-chain failure)
 *   4. Minimum profit threshold (floor to ensure effort is worthwhile)
 *
 * All profit is expressed in the start token's raw units (bigint).
 * For cross-denomination comparison, provide a tokenToMaticRate.
 *
 * Usage:
 *   import { computeProfit } from "./compute.js";
 *   const assessment = computeProfit(routeResult, { gasPrice: 30n * 10n**9n });
 *   if (assessment.shouldExecute) { ... }
 */

// ─── Constants ────────────────────────────────────────────────

/** 1 MATIC in wei */
const WEI = 10n ** 18n;

/** Default gas price: 50 gwei (conservative for Polygon) */
const DEFAULT_GAS_PRICE_WEI = 50n * 10n ** 9n;

/**
 * Default slippage factor (in basis points out of 10000).
 * 50 bps = 0.5% slippage from simulation to on-chain execution.
 */
const DEFAULT_SLIPPAGE_BPS = 50n;

/**
 * Default revert risk penalty (fraction of gross profit).
 * 5% probability of revert × full loss = 5% penalty.
 */
const DEFAULT_REVERT_RISK_BPS = 500n; // 5%

/** Basis point denominator */
const BPS_DENOM = 10_000n;

/**
 * Default minimum net profit in the start token's units.
 * Set to 0 — callers should set a meaningful floor (e.g. $0.50 in USDC units).
 */
const DEFAULT_MIN_PROFIT = 0n;

function ceilDiv(numerator: bigint, denominator: bigint) {
  return (numerator + denominator - 1n) / denominator;
}

function bigintToApproxNumber(value: bigint) {
  if (value === 0n) return 0;

  const negative = value < 0n;
  const abs = negative ? -value : value;
  const digits = abs.toString();

  if (digits.length <= 15) {
    const numeric = Number(abs);
    return negative ? -numeric : numeric;
  }

  const exponent = digits.length - 1;
  if (exponent > 308) return negative ? -Number.MAX_VALUE : Number.MAX_VALUE;

  const mantissaDigits = digits.slice(0, 15);
  const mantissa =
    mantissaDigits.length === 1
      ? mantissaDigits
      : `${mantissaDigits[0]}.${mantissaDigits.slice(1)}`;
  const numeric = Number(`${mantissa}e${exponent}`);
  return negative ? -numeric : numeric;
}

export function roiMicroUnits(profit: bigint, amountIn: bigint) {
  if (amountIn <= 0n) return 0;
  return bigintToApproxNumber((profit * 1_000_000n) / amountIn);
}

function invalidAssessment(routeResult: Partial<RouteResultLike>, reason: string): ProfitAssessment {
  return {
    shouldExecute: false,
    grossProfit: routeResult.profit ?? 0n,
    gasCostWei: 0n,
    gasCostInTokens: 0n,
    slippageDeduction: 0n,
    revertPenalty: 0n,
    netProfit: 0n,
    netProfitAfterGas: 0n,
    roi: 0,
    rejectReason: reason,
  };
}

// ─── Gas model ────────────────────────────────────────────────

/**
 * Estimate gas cost in wei.
 *
 * @param {number} gasUnits     Estimated gas consumption
 * @param {bigint} gasPriceWei  Current gas price in wei
 * @returns {bigint}            Gas cost in wei
 */
export function gasCostWei(gasUnits: number, gasPriceWei: bigint = DEFAULT_GAS_PRICE_WEI) {
  return BigInt(gasUnits) * gasPriceWei;
}

// ─── Slippage model ───────────────────────────────────────────

/**
 * Apply slippage to a profit estimate.
 *
 * Reduces the expected amountOut by slippageBps, reducing net profit.
 *
 * @param {bigint} amountOut   Simulated output amount
 * @param {bigint} slippageBps Slippage in basis points (0-10000)
 * @returns {bigint}           Slippage-adjusted amountOut
 */
export function applySlippage(amountOut: bigint, slippageBps: bigint = DEFAULT_SLIPPAGE_BPS) {
  const complement = BPS_DENOM - slippageBps;
  return (amountOut * complement) / BPS_DENOM;
}

// ─── Revert risk model ────────────────────────────────────────

/**
 * Compute a revert-risk penalty on profit.
 *
 * Models the expected loss from failed transactions:
 *   penalty = grossProfit * revertRiskBps / BPS_DENOM
 *
 * Factors that increase revert risk:
 *   - Many hops (more chances for state change between simulation and execution)
 *   - Low liquidity pools (more price movement)
 *   - High profit ratio (likely arb already being front-run)
 *
 * @param {bigint} grossProfit   Gross profit before gas
 * @param {number} hopCount      Number of hops
 * @param {bigint} revertRiskBps Base revert risk in bps (configurable)
 * @returns {bigint}             Revert risk penalty
 */
export function revertRiskPenalty(
  grossProfit: bigint,
  hopCount: number,
  revertRiskBps: bigint = DEFAULT_REVERT_RISK_BPS
) {
  // Increase risk for more hops: +200 bps per extra hop beyond 2
  const extraHops = BigInt(Math.max(0, hopCount - 2));
  const adjustedRisk = revertRiskBps + extraHops * 200n;
  const cappedRisk = adjustedRisk > 3000n ? 3000n : adjustedRisk; // cap at 30%

  return (grossProfit * cappedRisk) / BPS_DENOM;
}

// ─── Profitability assessment ─────────────────────────────────

/**
 * @typedef {Object} ProfitAssessment
 * @property {boolean} shouldExecute      Whether the route clears all thresholds
 * @property {bigint}  grossProfit        Raw simulated profit (amountOut - amountIn)
 * @property {bigint}  gasCostWei         Estimated gas cost in wei
 * @property {bigint}  slippageDeduction  Amount lost to slippage
 * @property {bigint}  revertPenalty      Expected loss from revert risk
 * @property {bigint}  netProfit          grossProfit - slippage - revert (in start token units)
 * @property {bigint}  netProfitAfterGas  netProfit minus gas cost (if same denomination)
 * @property {number}  roi                Net profit / amountIn (fraction * 1e6)
 * @property {string}  rejectReason       Non-empty if shouldExecute is false
 */

/**
 * Compute the full profitability assessment for a route simulation result.
 *
 * @param {Object} routeResult                 From simulateRoute()
 * @param {bigint} routeResult.amountIn
 * @param {bigint} routeResult.amountOut
 * @param {bigint} routeResult.profit
 * @param {number} routeResult.totalGas
 * @param {number} routeResult.hopCount        (optional, from path.hopCount)
 *
 * @param {Object} [options]
 * @param {bigint} [options.gasPriceWei]               Gas price override
 * @param {bigint} [options.tokenToMaticRate]          1 startToken in wei (for gas comparison)
 *                                                      If not provided, gas cost comparison is skipped.
 * @param {bigint} [options.slippageBps]               Slippage tolerance
 * @param {bigint} [options.revertRiskBps]             Revert risk
 * @param {bigint} [options.minNetProfit]              Minimum net profit threshold
 * @param {number} [options.hopCount]                  Override hop count
 *
 * @returns {ProfitAssessment}
 */
export function computeProfit(routeResult: RouteResultLike, options: ProfitOptions = {}): ProfitAssessment {
  const {
    gasPriceWei = DEFAULT_GAS_PRICE_WEI,
    tokenToMaticRate = null,
    slippageBps = DEFAULT_SLIPPAGE_BPS,
    revertRiskBps = DEFAULT_REVERT_RISK_BPS,
    minNetProfit = DEFAULT_MIN_PROFIT,
    hopCount = getResultHopCount(routeResult) || 2,
  } = options;

  if (!routeResult) return invalidAssessment({}, "missing route result");

  const { amountIn, amountOut, profit: grossProfit, totalGas } = routeResult;
  if (amountIn <= 0n) return invalidAssessment(routeResult, "amountIn <= 0");
  if (amountOut < 0n) return invalidAssessment(routeResult, "amountOut < 0");
  if (grossProfit !== amountOut - amountIn) return invalidAssessment(routeResult, "profit mismatch");
  if (!Number.isFinite(totalGas) || totalGas < 0) return invalidAssessment(routeResult, "invalid totalGas");
  if (gasPriceWei < 0n) return invalidAssessment(routeResult, "gasPriceWei < 0");
  if (slippageBps < 0n || slippageBps > BPS_DENOM) return invalidAssessment(routeResult, "invalid slippageBps");
  if (revertRiskBps < 0n || revertRiskBps > BPS_DENOM) return invalidAssessment(routeResult, "invalid revertRiskBps");
  if (minNetProfit < 0n) return invalidAssessment(routeResult, "minNetProfit < 0");
  if (!Number.isFinite(hopCount) || hopCount < 1) return invalidAssessment(routeResult, "invalid hopCount");
  if (tokenToMaticRate != null && tokenToMaticRate <= 0n) {
    return invalidAssessment(routeResult, "tokenToMaticRate <= 0");
  }

  // 1. Gas cost in wei
  const gasCost = gasCostWei(totalGas, gasPriceWei);

  // 2. Slippage deduction (applied to output amount)
  const adjustedOut = applySlippage(amountOut, slippageBps);
  const slippageDeduction = amountOut - adjustedOut;
  const profitAfterSlippage = adjustedOut - amountIn;

  // 3. Revert risk penalty
  const revertPenalty = revertRiskPenalty(
    profitAfterSlippage > 0n ? profitAfterSlippage : 0n,
    hopCount,
    revertRiskBps
  );

  const netProfit = profitAfterSlippage - revertPenalty;

  // 4. Gas cost deduction (only if we know the token/MATIC exchange rate)
  let netProfitAfterGas = netProfit;
  let gasCostInTokens = 0n;
  if (tokenToMaticRate != null && tokenToMaticRate > 0n) {
    // Convert gas cost from MATIC wei to raw start-token units.
    //
    // tokenToMaticRate = "how many MATIC wei is 1 raw start-token unit worth?"
    //   WMATIC (18 dec): rate = 1     → gasCostInTokens = gasCostWei / 1   = gasCostWei
    //   USDC   (6 dec):  rate = 1e12  → gasCostInTokens = gasCostWei / 1e12
    //   WETH   (18 dec): rate = 2500  → gasCostInTokens = gasCostWei / 2500
    gasCostInTokens = ceilDiv(gasCost, tokenToMaticRate);
    netProfitAfterGas = netProfit - gasCostInTokens;
  }

  // 5. ROI (net profit / input, in micro-units = parts per million)
  const roiBase = tokenToMaticRate != null && tokenToMaticRate > 0n
    ? netProfitAfterGas
    : netProfit;
  const roi = roiMicroUnits(roiBase, amountIn);

  // 6. Threshold checks
  let shouldExecute = true;
  let rejectReason = "";

  const thresholdProfit =
    tokenToMaticRate != null && tokenToMaticRate > 0n
      ? netProfitAfterGas
      : netProfit;

  if (grossProfit <= 0n) {
    shouldExecute = false;
    rejectReason = "gross profit <= 0";
  } else if (profitAfterSlippage <= 0n) {
    shouldExecute = false;
    rejectReason = "profit wiped by slippage";
  } else if (thresholdProfit < minNetProfit) {
    shouldExecute = false;
    rejectReason = `net profit ${thresholdProfit} < minimum ${minNetProfit}`;
  } else if (tokenToMaticRate != null && netProfitAfterGas <= 0n) {
    shouldExecute = false;
    rejectReason = "gas cost exceeds net profit";
  }

  return {
    shouldExecute,
    grossProfit,
    gasCostWei: gasCost,
    gasCostInTokens,
    slippageDeduction,
    revertPenalty,
    netProfit,
    netProfitAfterGas,
    roi,
    rejectReason,
  };
}

/**
 * Quick pass/fail check for a route, given current market conditions.
 *
 * @param {Object} routeResult    From simulateRoute()
 * @param {Object} marketContext
 * @param {bigint} marketContext.gasPriceWei
 * @param {bigint} [marketContext.tokenToMaticRate]
 * @param {bigint} [marketContext.minNetProfit]
 * @returns {boolean}
 */
export function isProfitable(routeResult: RouteResultLike, marketContext: ProfitOptions = {}) {
  const assessment = computeProfit(routeResult, marketContext);
  return assessment.shouldExecute;
}
type RouteResultLike = {
  amountIn: bigint;
  amountOut: bigint;
  profit: bigint;
  totalGas: number;
};

type ProfitOptions = {
  gasPriceWei?: bigint;
  tokenToMaticRate?: bigint | null;
  slippageBps?: bigint;
  revertRiskBps?: bigint;
  minNetProfit?: bigint;
  hopCount?: number;
};

type ProfitAssessment = {
  shouldExecute: boolean;
  grossProfit: bigint;
  gasCostWei: bigint;
  gasCostInTokens: bigint;
  slippageDeduction: bigint;
  revertPenalty: bigint;
  netProfit: bigint;
  netProfitAfterGas: bigint;
  roi: number;
  rejectReason: string;
};
