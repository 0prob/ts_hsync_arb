import assert from "node:assert/strict";

import { getSqrtRatioAtTick, getTickAtSqrtRatio, getTickAtSqrtRatioInRange } from "../src/math/tick_math.ts";
import { simulateV3Swap } from "../src/math/uniswap_v3.ts";
import { mergeStateIntoCache } from "../src/state/cache_utils.ts";
import { validatePoolState } from "../src/state/normalizer.ts";
import { buildGraph } from "../src/routing/graph.ts";
import { edgeSpotLogWeight } from "../src/routing/finder.ts";

{
  const cache = new Map<string, any>();
  const current = { poolId: "pool", reserve0: 1n, timestamp: 1 };
  cache.set("pool", current);

  const next = { poolId: "pool", reserve0: 2n, reserve1: 3n, timestamp: 2 };
  const merged = mergeStateIntoCache(cache, "pool", next);

  assert.equal(merged, current, "cache merge should preserve object identity for live state refs");
  assert.equal(cache.get("pool"), current, "cache entry should retain the original object reference");
  assert.equal(current.reserve0, 2n);
  assert.equal(current.reserve1, 3n);
  assert.equal("timestamp" in current, true);
}

{
  const state: any = {
    initialized: true,
    sqrtPriceX96: getSqrtRatioAtTick(0),
    tick: 0,
    liquidity: 1_000_000n,
    fee: 3000,
    ticks: new Map([
      [-60, { liquidityGross: 500_000n, liquidityNet: -500_000n }],
      [60, { liquidityGross: 500_000n, liquidityNet: 500_000n }],
    ]),
  };

  const first = simulateV3Swap(state, 1_000n, false);
  const second = simulateV3Swap(state, 1_000n, false);

  assert.equal(first.amountOut, second.amountOut, "v3 simulation should be stable across repeated calls");
  assert.equal(
    Object.hasOwn(state, "_sortedTicks"),
    false,
    "v3 simulation should not mutate shared state objects with cached tick data",
  );
}

{
  const state: any = {
    initialized: true,
    sqrtPriceX96: getSqrtRatioAtTick(0),
    tick: 0,
    tickVersion: 0,
    liquidity: 1_000_000n,
    fee: 3000,
    ticks: new Map([
      [60, { liquidityGross: 500_000n, liquidityNet: 500_000n }],
    ]),
  };

  const before = simulateV3Swap(state, 100_000n, false);
  state.ticks.set(1, { liquidityGross: 800_000n, liquidityNet: 800_000n });
  state.tickVersion += 1;
  const after = simulateV3Swap(state, 100_000n, false);

  assert.notEqual(
    before.amountOut,
    after.amountOut,
    "v3 simulation should invalidate cached sorted ticks when the tick map changes in place",
  );
}

{
  const noCrossState: any = {
    initialized: true,
    sqrtPriceX96: getSqrtRatioAtTick(0),
    tick: 0,
    liquidity: 10_000_000n,
    fee: 3000,
    ticks: new Map(),
  };

  const result = simulateV3Swap(noCrossState, 1_000n, false);
  assert.equal(
    result.tickAfter,
    getTickAtSqrtRatio(result.sqrtPriceX96After),
    "v3 simulation should derive tickAfter from the post-swap price when no initialized tick is crossed",
  );
}

{
  const sqrtPrice = getSqrtRatioAtTick(123);
  assert.equal(
    getTickAtSqrtRatioInRange(sqrtPrice, 100, 140),
    getTickAtSqrtRatio(sqrtPrice),
    "bounded tick search should agree with the full-range search when the price lies inside the interval",
  );
}

{
  const verdict = validatePoolState({
    poolId: "0xpool",
    protocol: "UNISWAP_V3",
    tokens: ["0xt0", "0xt1"],
    fee: 3000n,
    sqrtPriceX96: getSqrtRatioAtTick(0),
    tick: 0,
    liquidity: 1_000_000n,
    tickSpacing: 60,
    ticks: new Map([
      [1, { liquidityGross: 100n, liquidityNet: 100n }],
    ]),
    initialized: true,
    timestamp: Date.now(),
  });

  assert.equal(verdict.valid, false, "v3 validator should reject misaligned initialized ticks");
}

{
  const pools = [
    {
      pool_address: "0xpool",
      protocol: "QUICKSWAP_V2",
      status: "active",
      tokens: ["0xt0", "0xt1"],
      metadata: { feeNumerator: 999 },
    },
  ];
  const stateMap = new Map([
    ["0xpool", { reserve0: 10_000n, reserve1: 20_000n, fee: 999n }],
  ]);

  const graph = buildGraph(pools, stateMap);
  const edge = graph.getPoolEdge("0xpool", "0xt0", "0xt1");

  assert(edge, "graph should create a v2 edge");
  assert.equal(edge.fee, 999, "v2 edges should preserve the pool fee numerator");
  assert.equal(edge.feeBps, 10, "v2 fee bps should derive from the fee numerator");

  const expected = Math.log(20_000 / 10_000) + Math.log(999 / 1000);
  const actual = edgeSpotLogWeight(edge);
  assert.notEqual(actual, null, "v2 edge weight should be computable with valid reserves");
  assert(Math.abs((actual as number) - expected) < 1e-12, "v2 edge weight should use the actual pool fee");
}

console.log("Uniswap v2/v3 checks passed.");
