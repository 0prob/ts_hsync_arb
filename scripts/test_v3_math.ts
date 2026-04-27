import assert from "node:assert/strict";

import { simulateV3Swap } from "../src/math/uniswap_v3.ts";
import { getSqrtRatioAtTick, MAX_SQRT_RATIO, MIN_SQRT_RATIO } from "../src/math/tick_math.ts";
import { normalizePoolState, validatePoolState } from "../src/state/normalizer.ts";

const pool = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const tokenA = "0x1111111111111111111111111111111111111111";
const tokenB = "0x2222222222222222222222222222222222222222";

function v3State(overrides: Record<string, unknown> = {}) {
  return {
    poolId: pool,
    protocol: "UNISWAP_V3",
    token0: tokenA,
    token1: tokenB,
    tokens: [tokenA, tokenB],
    sqrtPriceX96: getSqrtRatioAtTick(0),
    tick: 0,
    liquidity: 1_000_000_000_000_000_000n,
    tickSpacing: 60,
    ticks: new Map(),
    initialized: true,
    fee: 3000n,
    timestamp: 1,
    ...overrides,
  };
}

{
  assert.equal(
    simulateV3Swap(v3State({ fee: -1n }), 1_000n, true).amountOut,
    0n,
    "V3 simulation should reject negative fee tiers",
  );
  assert.equal(
    simulateV3Swap(v3State({ fee: 1_000_000n }), 1_000n, true).amountOut,
    0n,
    "V3 simulation should reject fee tiers >= 100%",
  );
  assert.equal(
    simulateV3Swap(v3State({ liquidity: 0n }), 1_000n, true).amountOut,
    0n,
    "V3 simulation should reject zero-liquidity math inputs",
  );
  assert.equal(
    simulateV3Swap(v3State({ sqrtPriceX96: MIN_SQRT_RATIO - 1n }), 1_000n, true).amountOut,
    0n,
    "V3 simulation should reject sqrt prices below TickMath bounds",
  );
  assert.equal(
    simulateV3Swap(v3State({ sqrtPriceX96: MAX_SQRT_RATIO }), 1_000n, false).amountOut,
    0n,
    "V3 simulation should reject sqrt prices at or above the upper TickMath bound",
  );
}

{
  const invalidFee = normalizePoolState(
    pool,
    "UNISWAP_V3",
    [tokenA, tokenB],
    {
      sqrtPriceX96: getSqrtRatioAtTick(0),
      tick: 0,
      liquidity: 1_000_000n,
      fee: 1_000_000n,
      fetchedAt: 1,
    },
  );
  assert.equal(invalidFee, null);
  assert.deepEqual(validatePoolState(v3State({ fee: 1_000_000n })), { valid: false, reason: "V3: invalid fee" });

  const invalidSqrt = normalizePoolState(
    pool,
    "UNISWAP_V3",
    [tokenA, tokenB],
    {
      sqrtPriceX96: MAX_SQRT_RATIO,
      tick: 0,
      liquidity: 1_000_000n,
      fee: 3000n,
      fetchedAt: 1,
    },
  );
  assert.equal(invalidSqrt, null);
  assert.deepEqual(validatePoolState(v3State({ sqrtPriceX96: MAX_SQRT_RATIO })), { valid: false, reason: "V3: zero sqrtPrice" });
}

console.log("V3 math checks passed.");
