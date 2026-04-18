
/**
 * src/math/balancer.js — Balancer V2 weighted pool swap math
 *
 * Implements the weighted constant-product invariant for Balancer pools:
 *
 *   Invariant:  V = prod(B_i ^ w_i)
 *
 * Swap formula (exact input):
 *   amountOut = balanceOut * (1 - (balanceIn / (balanceIn + amountInAfterFee))^(wIn/wOut))
 *
 * Swap formula (exact output):
 *   amountIn = balanceIn * ((balanceOut / (balanceOut - amountOut))^(wOut/wIn) - 1) / (1 - fee)
 *
 * All math uses 18-decimal fixed-point BigInt arithmetic to avoid
 * floating-point precision loss.
 *
 * Pool state shape expected:
 *   {
 *     poolId:    string,
 *     protocol:  string,
 *     tokens:    string[],   // token addresses
 *     balances:  bigint[],   // raw balances (token-decimal precision)
 *     weights:   bigint[],   // normalized weights in 1e18 (must sum to 1e18)
 *     swapFee:   bigint,     // swap fee in 1e18 (e.g. 3e15 = 0.3%)
 *     timestamp: number,
 *   }
 *
 * References:
 *   https://docs.balancer.fi/reference/math/weighted-math.html
 *   BalancerV2 WeightedMath.sol
 */

// ─── Constants ────────────────────────────────────────────────

const ONE = 10n ** 18n;

// Maximum number of iterations for power approximation
const MAX_POW_ITERATIONS = 255;

// Error tolerance for power series convergence
const POW_PRECISION = 10n ** 10n; // 1e-8

// ─── Fixed-point power (x^y) via log/exp series ───────────────

/**
 * Compute natural log approximation of x (in 1e18 fixed-point).
 * Uses the identity: ln(x) = 2 * atanh((x-1)/(x+1)) for x > 0.
 * Limited to inputs near 1.0 for the series to converge quickly.
 *
 * For a broader range we use: ln(x) = ln(2) * log2(x)
 * with log2 computed via bit-shifting (integer part) + series (fractional).
 *
 * @param {bigint} a  Input in 1e18 fixed-point (must be > 0)
 * @returns {bigint}  ln(a) in 1e18 fixed-point
 */
function ln(a: bigint): bigint {
  if (a <= 0n) throw new Error("Balancer: ln undefined for non-positive");
  if (a === ONE) return 0n;

  // Use identity: ln(a) = -ln(1/a) for a < 1
  if (a < ONE) {
    return -ln((ONE * ONE) / a);
  }

  // Reduce: find k such that 2^k <= a/1e18 < 2^(k+1)
  // Then ln(a) = k * ln(2) + ln(a / 2^k)
  let k = 0n;
  let z = a;
  // ln(2) ≈ 0.693147180559945...e18
  const LN2 = 693147180559945309n;

  while (z >= 2n * ONE) {
    z /= 2n;
    k++;
  }

  // Now z is in [1e18, 2e18)
  // Taylor series: ln(1+u) = u - u^2/2 + u^3/3 - ... for |u| < 1
  // u = (z - 1e18) / 1e18
  const u = z - ONE;
  let term = u;
  let sum = 0n;
  let neg = false;

  for (let i = 1n; i <= 20n; i++) {
    if (!neg) {
      sum += term / i;
    } else {
      sum -= term / i;
    }
    neg = !neg;
    term = (term * u) / ONE;
    if (term < 100n) break;
  }

  return k * LN2 + sum;
}

/**
 * Compute e^x in 1e18 fixed-point.
 * Uses Taylor series: e^x = 1 + x + x^2/2! + x^3/3! + ...
 *
 * @param {bigint} x  Exponent in 1e18 fixed-point
 * @returns {bigint}  e^x in 1e18 fixed-point
 */
function exp(x: bigint): bigint {
  if (x === 0n) return ONE;

  // Handle negative exponent: e^(-x) = 1/e^x
  if (x < 0n) {
    return (ONE * ONE) / exp(-x);
  }

  let sum = ONE;
  let term = ONE;

  for (let i = 1n; i <= 30n; i++) {
    term = (term * x) / (ONE * i);
    sum += term;
    if (term < 10n) break;
  }

  return sum;
}

/**
 * Compute x^y in 1e18 fixed-point.
 *
 * @param {bigint} x  Base in 1e18 fixed-point (must be > 0)
 * @param {bigint} y  Exponent in 1e18 fixed-point
 * @returns {bigint}  x^y in 1e18 fixed-point
 */
function powDown(x: bigint, y: bigint): bigint {
  const lnX = ln(x);
  return exp((y * lnX) / ONE);
}

// ─── Swap math ────────────────────────────────────────────────

/**
 * Compute output amount for a Balancer weighted pool exactInput swap.
 *
 * Formula:
 *   amountOut = balanceOut * (1 - (balanceIn / (balanceIn + amountIn*(1-fee))) ^ (wIn/wOut))
 *
 * @param {bigint} amountIn   Input amount (in token decimals)
 * @param {Object} poolState  Balancer pool state
 * @param {number} inIdx      Index of input token
 * @param {number} outIdx     Index of output token
 * @returns {bigint}          Output amount (after fees)
 */
export function getBalancerAmountOut(amountIn: bigint, poolState: any, inIdx: number, outIdx: number): bigint {
  if (amountIn <= 0n) return 0n;

  const { balances, weights, swapFee } = poolState;
  if (!balances || !weights) return 0n;

  const balIn = balances[inIdx];
  const balOut = balances[outIdx];
  const wIn = weights[inIdx];
  const wOut = weights[outIdx];

  if (balIn <= 0n || balOut <= 0n) return 0n;

  // amountIn after fee: amountIn * (1 - swapFee)
  const feeComplement = ONE - swapFee;
  const amountInAfterFee = (amountIn * feeComplement) / ONE;

  // ratio = balIn / (balIn + amountInAfterFee) in 1e18
  const base = (balIn * ONE) / (balIn + amountInAfterFee);

  // exponent = wIn / wOut in 1e18
  const exponent = (wIn * ONE) / wOut;

  // base^exponent
  const power = powDown(base, exponent);

  // amountOut = balOut * (1 - power)
  const amountOut = (balOut * (ONE - power)) / ONE;

  return amountOut > 0n ? amountOut : 0n;
}

/**
 * Compute input amount required for a Balancer weighted pool exactOutput swap.
 *
 * Formula:
 *   amountIn = balanceIn * ((balanceOut / (balanceOut - amountOut)) ^ (wOut/wIn) - 1) / (1 - fee)
 *
 * @param {bigint} amountOut  Desired output amount
 * @param {Object} poolState  Balancer pool state
 * @param {number} inIdx      Index of input token
 * @param {number} outIdx     Index of output token
 * @returns {bigint}          Required input amount
 */
export function getBalancerAmountIn(amountOut: bigint, poolState: any, inIdx: number, outIdx: number): bigint {
  if (amountOut <= 0n) return 0n;

  const { balances, weights, swapFee } = poolState;
  if (!balances || !weights) return 0n;

  const balIn = balances[inIdx];
  const balOut = balances[outIdx];
  const wIn = weights[inIdx];
  const wOut = weights[outIdx];

  if (balIn <= 0n || balOut <= 0n) return 0n;
  if (amountOut >= balOut) return 0n; // Not enough liquidity

  // exponent = wOut / wIn
  const exponent = (wOut * ONE) / wIn;

  // base = balOut / (balOut - amountOut)
  const base = (balOut * ONE) / (balOut - amountOut);

  // power = base^exponent
  const power = powDown(base, exponent);

  // amountInBeforeFee = balIn * (power - 1)
  const amountInBeforeFee = (balIn * (power - ONE)) / ONE;

  // amountIn = amountInBeforeFee / (1 - fee)
  const feeComplement = ONE - swapFee;
  if (feeComplement <= 0n) return 0n;

  return (amountInBeforeFee * ONE) / feeComplement + 1n;
}

/**
 * Simulate a Balancer weighted pool swap given a unified pool state.
 *
 * Routing-compatible wrapper.
 *
 * @param {bigint}  amountIn    Input amount
 * @param {Object}  poolState   Normalized Balancer pool state (from normalizer)
 * @param {boolean} zeroForOne  true = token0→token1
 * @returns {{ amountOut: bigint, gasEstimate: number }}
 */
export function simulateBalancerSwap(amountIn: bigint, poolState: any, zeroForOne: boolean): { amountOut: bigint; gasEstimate: number } {
  if (amountIn <= 0n) return { amountOut: 0n, gasEstimate: 0 };

  const inIdx = zeroForOne ? 0 : 1;
  const outIdx = zeroForOne ? 1 : 0;

  const amountOut = getBalancerAmountOut(amountIn, poolState, inIdx, outIdx);

  // Balancer swaps: ~150k gas
  return { amountOut, gasEstimate: 150_000 };
}
