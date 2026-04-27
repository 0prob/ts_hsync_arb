
/**
 * src/math/uniswap_v2.js — Constant-product (x*y=k) swap simulator
 *
 * Deterministic off-chain simulation of a V2 swap.
 * Applies the standard 0.3% fee (or configurable fee).
 *
 * Works for QuickSwap V2, SushiSwap V2, and any Uniswap V2 fork.
 */

// ─── Constants ────────────────────────────────────────────────

/** Default fee numerator: 997 means 0.3% fee (3/1000) */
const DEFAULT_FEE_NUMERATOR = 997n;
const FEE_DENOMINATOR = 1000n;

// ─── V2 Swap Simulator ───────────────────────────────────────

/**
 * Calculate output amount for a V2 constant-product swap.
 *
 * Formula: amountOut = (reserveOut * amountIn * feeNum) / (reserveIn * 1000 + amountIn * feeNum)
 *
 * @param {bigint} amountIn     Input amount
 * @param {bigint} reserveIn    Reserve of the input token
 * @param {bigint} reserveOut   Reserve of the output token
 * @param {bigint} [feeNumerator=997n]  Fee numerator (997 = 0.3% fee)
 * @returns {bigint}            Output amount
 */
export function getV2AmountOut(
  amountIn: bigint,
  reserveIn: bigint,
  reserveOut: bigint,
  feeNumerator: bigint = DEFAULT_FEE_NUMERATOR,
  feeDenominator: bigint = FEE_DENOMINATOR
): bigint {
  if (amountIn <= 0n) return 0n;
  if (reserveIn <= 0n || reserveOut <= 0n) return 0n;
  if (feeNumerator <= 0n || feeDenominator <= 0n || feeNumerator >= feeDenominator) return 0n;

  const amountInWithFee = amountIn * feeNumerator;
  const numerator = amountInWithFee * reserveOut;
  const denominator = reserveIn * feeDenominator + amountInWithFee;

  return numerator / denominator;
}

/**
 * Calculate input amount needed for a desired output in a V2 swap.
 *
 * Formula: amountIn = (reserveIn * amountOut * 1000) / ((reserveOut - amountOut) * feeNum) + 1
 *
 * @param {bigint} amountOut    Desired output amount
 * @param {bigint} reserveIn    Reserve of the input token
 * @param {bigint} reserveOut   Reserve of the output token
 * @param {bigint} [feeNumerator=997n]  Fee numerator
 * @returns {bigint}            Required input amount
 */
export function getV2AmountIn(
  amountOut: bigint,
  reserveIn: bigint,
  reserveOut: bigint,
  feeNumerator: bigint = DEFAULT_FEE_NUMERATOR,
  feeDenominator: bigint = FEE_DENOMINATOR
): bigint {
  if (amountOut <= 0n) return 0n;
  if (reserveIn <= 0n || reserveOut <= 0n) return 0n;
  if (feeNumerator <= 0n || feeDenominator <= 0n || feeNumerator >= feeDenominator) return 0n;
  if (amountOut >= reserveOut) {
    throw new Error("V2Math: insufficient liquidity for desired output");
  }

  const numerator = reserveIn * amountOut * feeDenominator;
  const denominator = (reserveOut - amountOut) * feeNumerator;

  return numerator / denominator + 1n;
}

/**
 * Simulate a V2 swap given pool state.
 *
 * @param {Object} poolState       Pool state from fetchV2PoolState()
 * @param {bigint} poolState.reserve0  Reserve of token0
 * @param {bigint} poolState.reserve1  Reserve of token1
 * @param {bigint} amountIn        Input amount
 * @param {boolean} zeroForOne     Direction: true = token0→token1
 * @param {bigint} [feeNumerator]  Optional fee override
 * @returns {{ amountOut: bigint, gasEstimate: number }}
 */
export function simulateV2Swap(
  poolState: any,
  amountIn: bigint,
  zeroForOne: boolean,
  feeNumerator?: bigint,
  feeDenominator?: bigint
): { amountOut: bigint; gasEstimate: number } {
  if (amountIn <= 0n) {
    return { amountOut: 0n, gasEstimate: 0 };
  }

  const reserveIn = BigInt(zeroForOne ? poolState.reserve0 : poolState.reserve1);
  const reserveOut = BigInt(zeroForOne ? poolState.reserve1 : poolState.reserve0);

  if (reserveIn <= 0n || reserveOut <= 0n) {
    return { amountOut: 0n, gasEstimate: 0 };
  }

  const resolvedFeeNumerator = feeNumerator ?? (poolState.fee != null ? BigInt(poolState.fee) : DEFAULT_FEE_NUMERATOR);
  const resolvedFeeDenominator = feeDenominator ?? (poolState.feeDenominator != null ? BigInt(poolState.feeDenominator) : FEE_DENOMINATOR);
  const amountOut = getV2AmountOut(
    amountIn,
    reserveIn,
    reserveOut,
    resolvedFeeNumerator,
    resolvedFeeDenominator,
  );

  // V2 swaps are ~60k gas
  return { amountOut, gasEstimate: 60000 };
}

/**
 * Quote a V2 swap: convenience wrapper.
 *
 * @param {Object} poolState  Pool state
 * @param {bigint} amountIn   Input amount
 * @param {boolean} zeroForOne Direction
 * @returns {bigint}          Output amount
 */
export function quoteV2(poolState: any, amountIn: bigint, zeroForOne: boolean): bigint {
  return simulateV2Swap(poolState, amountIn, zeroForOne).amountOut;
}
