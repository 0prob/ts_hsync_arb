
/**
 * src/math/uniswap_v3.js — Optimized Uniswap V3 swap simulator
 *
 * Deterministic off-chain simulation of a V3 swap.
 * Optimized for high-frequency trading (HFT) performance:
 *   - Pre-sorts and caches initialized ticks to avoid O(N log N) sorts in hot path.
 *   - Uses binary search (O(log N)) to find the next initialized tick.
 *
 * This module is a pure function — it takes a pool state snapshot
 * and returns the swap result without any side effects.
 */

import {
  getSqrtRatioAtTick,
  getTickAtSqrtRatioInRange,
  MIN_TICK,
  MAX_TICK,
} from "./tick_math.ts";
import { computeSwapStep } from "./swap_math.ts";

// ─── Optimized Tick Navigation ──────────────────────────────────

const sortedTicksCache = new WeakMap<object, {
  tickVersion: number;
  ticksRef: Map<number, any>;
  sortedTicks: number[];
}>();

/**
 * Find the next initialized tick in the swap direction using binary search.
 *
 * @param {number[]} sortedTicks  Pre-sorted array of initialized tick indices
 * @param {number}   currentTick  Current pool tick
 * @param {boolean}  zeroForOne   Direction (true = decreasing, false = increasing)
 * @returns {number|null}
 */
function nextInitializedTickOptimized(sortedTicks: any, currentTick: any, zeroForOne: any) {
  if (!sortedTicks || sortedTicks.length === 0) return null;

  let low = 0;
  let high = sortedTicks.length - 1;
  let result = null;

  if (zeroForOne) {
    // Price decreasing: find largest tick <= currentTick
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (sortedTicks[mid] <= currentTick) {
        result = sortedTicks[mid];
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
  } else {
    // Price increasing: find smallest tick > currentTick
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (sortedTicks[mid] > currentTick) {
        result = sortedTicks[mid];
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }
  }

  return result;
}

function getSortedTicks(state: any) {
  const ticks = state?.ticks;
  if (!(ticks instanceof Map) || ticks.size === 0) return [];

  const tickVersion = Number.isFinite(Number(state?.tickVersion))
    ? Number(state.tickVersion)
    : 0;
  const cached = sortedTicksCache.get(state);
  if (cached && cached.ticksRef === ticks && cached.tickVersion === tickVersion) {
    return cached.sortedTicks;
  }

  const sortedTicks = Array.from(ticks.keys()).sort((a: any, b: any) => a - b);
  sortedTicksCache.set(state, {
    tickVersion,
    ticksRef: ticks,
    sortedTicks,
  });
  return sortedTicks;
}

// ─── V3 Swap Simulator ───────────────────────────────────────

/**
 * Simulate a Uniswap V3 exactInput swap.
 *
 * @param {Object} state             Pool state snapshot
 * @param {bigint} amountIn          Amount of input token (positive)
 * @param {boolean} zeroForOne       Direction: true = token0→token1, false = token1→token0
 * @param {number} [feeOverride]     Optional fee tier override
 * @returns {{ amountOut: bigint, sqrtPriceX96After: bigint, tickAfter: number, gasEstimate: number }}
 */
export function simulateV3Swap(state: any, amountIn: bigint, zeroForOne: boolean, feeOverride?: number) {
  if (amountIn <= 0n || !state.initialized || state.sqrtPriceX96 === 0n) {
    return {
      amountOut: 0n,
      sqrtPriceX96After: state.sqrtPriceX96 || 0n,
      tickAfter: state.tick || 0,
      gasEstimate: 0,
    };
  }

  const feePips = BigInt(feeOverride ?? state.fee);

  // Price limit: min or max sqrt ratio depending on direction
  const sqrtPriceLimitX96 = zeroForOne
    ? getSqrtRatioAtTick(MIN_TICK) + 1n
    : getSqrtRatioAtTick(MAX_TICK) - 1n;

  const sortedTicks = getSortedTicks(state);

  // Mutable swap state
  let sqrtPriceX96 = state.sqrtPriceX96;
  let tick = state.tick;
  let liquidity = state.liquidity;
  let amountRemaining = amountIn; // exactIn: positive
  let amountCalculated = 0n; // accumulated output
  let ticksCrossed = 0;

  // Safety: max iterations to prevent infinite loops
  const MAX_ITERATIONS = 500;

  for (let i = 0; i < MAX_ITERATIONS && amountRemaining > 0n; i++) {
    // Find the next initialized tick boundary
    const nextTick = nextInitializedTickOptimized(
      sortedTicks,
      tick,
      zeroForOne
    );

    // Determine the sqrt price at the next tick boundary
    const sqrtPriceNextTickX96 =
      nextTick !== null
        ? getSqrtRatioAtTick(nextTick)
        : sqrtPriceLimitX96;

    // Clamp to price limit
    const sqrtRatioTargetX96 = zeroForOne
      ? sqrtPriceNextTickX96 < sqrtPriceLimitX96
        ? sqrtPriceLimitX96
        : sqrtPriceNextTickX96
      : sqrtPriceNextTickX96 > sqrtPriceLimitX96
        ? sqrtPriceLimitX96
        : sqrtPriceNextTickX96;

    // Compute swap within this tick range
    const step = computeSwapStep(
      sqrtPriceX96,
      sqrtRatioTargetX96,
      liquidity,
      amountRemaining,
      feePips
    );

    // Update state
    sqrtPriceX96 = step.sqrtRatioNextX96;
    amountRemaining -= step.amountIn + step.feeAmount;
    amountCalculated += step.amountOut;

    // Check if we crossed a tick boundary
    if (sqrtPriceX96 === sqrtPriceNextTickX96 && nextTick !== null) {
      // Cross the tick — adjust liquidity
      const tickData = state.ticks.get(nextTick);
      if (tickData) {
        // When moving left (zeroForOne), we subtract liquidityNet
        // When moving right (!zeroForOne), we add liquidityNet
        liquidity = zeroForOne
          ? liquidity - tickData.liquidityNet
          : liquidity + tickData.liquidityNet;
        ticksCrossed++;
      }

      // Update tick position
      tick = zeroForOne ? nextTick - 1 : nextTick;
    } else {
      // Didn't reach the next initialized boundary, so derive the active tick
      // from the post-swap sqrt price to keep downstream metadata canonical.
      // We already know the active tick must lie within the interval bounded by
      // the previous active tick and the next initialized boundary (if any).
      const minTick = zeroForOne
        ? nextTick ?? MIN_TICK
        : tick;
      const maxTick = zeroForOne
        ? tick
        : nextTick != null
          ? nextTick - 1
          : MAX_TICK;
      tick = getTickAtSqrtRatioInRange(sqrtPriceX96, minTick, maxTick);
      break;
    }

    // Safety: if liquidity drops to zero, we can't continue
    if (liquidity <= 0n) break;
  }

  // Gas estimate: ~130k base + ~30k per tick crossed
  const gasEstimate = 130000 + ticksCrossed * 30000;

  return {
    amountOut: amountCalculated,
    sqrtPriceX96After: sqrtPriceX96,
    tickAfter: tick,
    gasEstimate,
  };
}

/**
 * Quote a V3 swap: given amountIn of one token, how much of the other do you get?
 *
 * @param {Object} state      Pool state snapshot
 * @param {bigint} amountIn   Input amount
 * @param {boolean} zeroForOne Direction
 * @param {number} [fee]      Optional fee tier override
 * @returns {bigint}          Output amount
 */
export function quoteV3(state: any, amountIn: any, zeroForOne: any, fee: any) {
  return simulateV3Swap(state, amountIn, zeroForOne, fee).amountOut;
}
