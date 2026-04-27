import assert from "node:assert/strict";

import {
  getBalancerAmountIn,
  getBalancerAmountOut,
} from "../src/math/balancer.ts";
import { buildGraph } from "../src/routing/graph.ts";
import { simulateHop } from "../src/routing/simulator.ts";
import { normalizePoolState, validatePoolState } from "../src/state/normalizer.ts";

const ONE = 10n ** 18n;
const pool = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const tokenA = "0x1111111111111111111111111111111111111111";
const tokenB = "0x2222222222222222222222222222222222222222";
const tokenC = "0x3333333333333333333333333333333333333333";
const tokenD = "0x4444444444444444444444444444444444444444";

function absDiff(a: bigint, b: bigint) {
  return a >= b ? a - b : b - a;
}

function weightedState(overrides: Record<string, unknown> = {}) {
  return {
    poolId: pool,
    protocol: "BALANCER_WEIGHTED",
    tokens: [tokenA, tokenB, tokenC],
    balances: [1_000n * ONE, 2_000n * ONE, 3_000n * ONE],
    weights: [5n * 10n ** 17n, 3n * 10n ** 17n, 2n * 10n ** 17n],
    swapFee: 3n * 10n ** 15n,
    timestamp: 1,
    ...overrides,
  };
}

{
  const normalized = normalizePoolState(
    pool,
    "BALANCER_WEIGHTED",
    [tokenA, tokenB],
    {
      balances: [1_000n * ONE, 1_000n * ONE],
      swapFee: 3n * 10n ** 15n,
      fetchedAt: 1,
    },
  );

  assert.equal(
    normalized,
    null,
    "Balancer state without RPC or metadata weights should not invent equal weights",
  );
}

{
  const normalized = normalizePoolState(
    pool.toUpperCase(),
    "BALANCER_WEIGHTED",
    [tokenA.toUpperCase(), tokenB],
    {
      poolId: "0x" + "ab".repeat(32),
      balances: [1_000n * ONE, 1_000n * ONE],
      weights: [5n * 10n ** 17n, 5n * 10n ** 17n],
      swapFee: 3n * 10n ** 15n,
      specialization: 2,
      lastChangeBlock: 123,
      fetchedAt: 1,
    },
    {
      tokenDecimals: [6, 18],
      poolType: "WeightedPool",
    },
  );

  assert.equal(normalized?.poolId, pool);
  assert.equal(normalized?.balancerPoolId, "0x" + "ab".repeat(32));
  assert.deepEqual(normalized?.tokenDecimals, [6, 18]);
  assert.equal(normalized?.specialization, 2);
  assert.equal(normalized?.lastChangeBlock, 123);
  assert.deepEqual(validatePoolState(normalized), { valid: true });
}

{
  const state = weightedState({
    balances: [1_000n * ONE, 1_000n * ONE],
    weights: [5n * 10n ** 17n, 5n * 10n ** 17n],
  });

  const amountIn = 100n * ONE;
  const amountOut = getBalancerAmountOut(amountIn, state, 0, 1);
  const expected = (1_000n * ONE * amountIn * (ONE - state.swapFee)) /
    (1_000n * ONE * ONE + amountIn * (ONE - state.swapFee));

  assert(
    absDiff(amountOut, expected) <= 1_000n,
    "50/50 Balancer output should match constant-product exact-input math",
  );
  const recoveredAmountIn = getBalancerAmountIn(amountOut, state, 0, 1);
  assert.equal(
    getBalancerAmountOut(recoveredAmountIn, state, 0, 1) >= amountOut,
    true,
    "exact-output search should find an input that satisfies the requested output",
  );
  assert.equal(
    getBalancerAmountOut(recoveredAmountIn - 1n, state, 0, 1) < amountOut,
    true,
    "exact-output search should return the minimum satisfying input",
  );
}

{
  const state = weightedState({
    balances: [1_000n * ONE, 1_000n * ONE],
    weights: [8n * 10n ** 17n, 2n * 10n ** 17n],
  });

  assert.equal(
    getBalancerAmountOut(300n * ONE, state, 0, 1) > 0n,
    true,
    "Balancer max-in ratio should allow trades at 30% of balance",
  );
  assert.equal(
    getBalancerAmountOut(300n * ONE + 1n, state, 0, 1),
    0n,
    "Balancer max-in ratio should reject trades above 30% of balance",
  );
  assert.equal(
    getBalancerAmountIn(300n * ONE, state, 0, 1) > 0n,
    true,
    "Balancer max-out ratio should allow exact-output trades at 30% of balance",
  );
  assert.equal(
    getBalancerAmountIn(300n * ONE + 1n, state, 0, 1),
    0n,
    "Balancer max-out ratio should reject exact-output trades above 30% of balance",
  );
}

{
  const negativeFeeState = weightedState({ swapFee: -1n });
  const fullFeeState = weightedState({ swapFee: ONE });

  assert.equal(
    getBalancerAmountOut(1n * ONE, negativeFeeState, 0, 1),
    0n,
    "Balancer weighted exact-input math should reject negative swap fees",
  );
  assert.equal(
    getBalancerAmountOut(1n * ONE, fullFeeState, 0, 1),
    0n,
    "Balancer weighted exact-input math should reject fees >= 100%",
  );
  assert.equal(
    getBalancerAmountIn(1n * ONE, negativeFeeState, 0, 1),
    0n,
    "Balancer weighted exact-output math should reject negative swap fees",
  );
  assert.equal(
    getBalancerAmountIn(1n * ONE, fullFeeState, 0, 1),
    0n,
    "Balancer weighted exact-output math should reject fees >= 100%",
  );
}

{
  const state = weightedState();
  const stateCache = new Map([[pool, state]]);
  const direct = getBalancerAmountOut(10n * ONE, state, 2, 0);
  const simulated = simulateHop(
    {
      protocol: "BALANCER_WEIGHTED",
      poolAddress: pool,
      tokenIn: tokenC,
      tokenOut: tokenA,
    },
    10n * ONE,
    stateCache,
  );

  assert.equal(
    simulated.amountOut,
    direct,
    "Balancer simulation should resolve token indexes from multi-token state when edges lack explicit indexes",
  );
}

{
  const normalized = normalizePoolState(
    pool,
    "BALANCER_V2",
    [tokenA, tokenB, tokenD],
    {
      balances: [1_000_000n * ONE, 1_000_000n * ONE, 1_000_000n * ONE],
      scalingFactors: [ONE, ONE, ONE],
      amp: 1_000_000n,
      ampPrecision: 1_000n,
      swapFee: 1n * 10n ** 15n,
      poolType: "ComposableStablePool",
      isStable: true,
      fetchedAt: 1,
    },
  );

  assert.deepEqual(validatePoolState(normalized), { valid: true });

  const stateCache = new Map([[pool, normalized]]);
  const simulated = simulateHop(
    {
      protocol: "BALANCER_V2",
      poolAddress: pool,
      tokenIn: tokenA,
      tokenOut: tokenB,
    },
    1_000n * ONE,
    stateCache,
  );

  assert.equal(
    simulated.amountOut > 990n * ONE,
    true,
    "Balancer stable simulation should produce low-slippage exact-input output without weights",
  );
  assert.equal(
    simulated.amountOut < 1_000n * ONE,
    true,
    "Balancer stable simulation should include swap fee and price impact",
  );
}

{
  const stableState = {
    poolId: pool,
    protocol: "BALANCER_V2",
    token0: tokenA,
    token1: tokenB,
    tokens: [tokenA, tokenB],
    balances: [1_000_000n * ONE, 1_000_000n * ONE],
    scalingFactors: [ONE, ONE],
    amp: 1_000_000n,
    ampPrecision: 1_000n,
    swapFee: 1n * 10n ** 15n,
    isStable: true,
    timestamp: 1,
  };
  const graph = buildGraph(
    [
      {
        pool_address: pool,
        protocol: "BALANCER_V2",
        tokens: [pool, tokenA, tokenB],
        metadata: { poolType: "ComposableStablePool" },
        status: "active",
      },
    ],
    new Map([[pool, stableState]]),
  );

  assert.equal(graph.hasToken(pool), false, "Composable stable BPT token should not be routed as a swap token");
  assert.equal(graph.getEdgesBetween(tokenA, tokenB).length, 1, "real stable token pair should be routed");
  assert.equal(graph.getEdgesBetween(tokenA, tokenB)[0]?.tokenInIdx, 0);
  assert.equal(graph.getEdgesBetween(tokenA, tokenB)[0]?.tokenOutIdx, 1);
}

console.log("Balancer checks passed.");
