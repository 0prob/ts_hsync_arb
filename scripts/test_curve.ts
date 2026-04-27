import assert from "node:assert/strict";

import { getCurveAmountIn, getCurveAmountOut, simulateCurveSwap } from "../src/math/curve.ts";
import { simulateHop } from "../src/routing/simulator.ts";
import { normalizeCurveState, validatePoolState } from "../src/state/normalizer.ts";

const pool = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const tokenA = "0x1111111111111111111111111111111111111111";
const tokenB = "0x2222222222222222222222222222222222222222";
const tokenC = "0x3333333333333333333333333333333333333333";
const precision = 10n ** 18n;

const stableState = {
  poolId: pool,
  protocol: "CURVE_STABLE_FACTORY",
  tokens: [tokenA, tokenB, tokenC],
  balances: [1_000_000n * precision, 1_000_000n * precision, 1_000_000n * precision],
  rates: [precision, precision, precision],
  fee: 4_000_000n,
  A: 10_000n,
  timestamp: 1,
};

{
  const amountOut = getCurveAmountOut(1_000n * precision, stableState, 0, 1);
  assert.equal(amountOut > 0n, true);
  assert.equal(getCurveAmountIn(amountOut, stableState, 0, 1) > 0n, true);
  assert.equal(simulateCurveSwap(1_000n * precision, stableState, 0, 2).amountOut > 0n, true);
}

{
  assert.equal(getCurveAmountOut(1_000n, stableState, 0, 99), 0n);
  assert.equal(getCurveAmountOut(1_000n, stableState, 1, 1), 0n);
  assert.equal(getCurveAmountOut(1_000n, { ...stableState, rates: [precision] }, 0, 1), 0n);
  assert.equal(getCurveAmountOut(1_000n, { ...stableState, balances: [1n, 0n, 1n] }, 0, 1), 0n);
  assert.equal(getCurveAmountOut(1_000n, { ...stableState, fee: -1n }, 0, 1), 0n);
  assert.equal(getCurveAmountIn(1n, { ...stableState, rates: [precision] }, 0, 1), 0n);
}

{
  const edge = {
    protocol: "CURVE_STABLE_FACTORY",
    poolAddress: pool,
    tokenIn: tokenA,
    tokenOut: tokenC,
    tokenInIdx: 0,
    tokenOutIdx: 2,
  };
  assert.equal(simulateHop(edge, 1_000n * precision, new Map([[pool, stableState]])).amountOut > 0n, true);

  const badEdge = { ...edge, tokenOutIdx: 99 };
  assert.equal(simulateHop(badEdge, 1_000n * precision, new Map([[pool, stableState]])).amountOut, 0n);
}

{
  const normalized = normalizeCurveState(
    pool,
    "CURVE_STABLE_FACTORY",
    [tokenA, tokenB],
    {
      balances: [1_000_000n * precision, 2_000_000n * precision],
      rates: [precision],
      A: 10_000n,
      fee: 4_000_000n,
      fetchedAt: 1,
    },
    { tokenDecimals: [18, 6] },
  );

  assert.equal(normalized.rates.length, 2);
  assert.deepEqual(validatePoolState(normalized), { valid: true });
}

console.log("Curve checks passed.");
