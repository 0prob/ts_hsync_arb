import assert from "node:assert/strict";

import { getV2AmountIn, getV2AmountOut } from "../src/math/uniswap_v2.ts";
import { buildGraph, deserializeTopology, serializeTopology } from "../src/routing/graph.ts";
import { edgeSpotLogWeight } from "../src/routing/finder.ts";
import { simulateHop } from "../src/routing/simulator.ts";
import { normalizePoolState, validatePoolState } from "../src/state/normalizer.ts";
import { updateV2State } from "../src/state/watcher_state_ops.ts";

const pool = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const tokenA = "0x1111111111111111111111111111111111111111";
const tokenB = "0x2222222222222222222222222222222222222222";

{
  const normalized = normalizePoolState(
    pool,
    "UNISWAP_V2",
    [tokenA, tokenB],
    {
      reserve0: 1_000_000n,
      reserve1: 2_000_000n,
      blockTimestampLast: 123,
      fetchedAt: 1,
    },
    {
      feeNumerator: "9970",
      feeDenominator: "10000",
    },
  );

  assert.equal(normalized?.fee, 9970n);
  assert.equal(normalized?.feeDenominator, 10000n);
  assert.deepEqual(validatePoolState(normalized), { valid: true });
}

{
  const amountIn = 10_000n;
  const reserveIn = 1_000_000n;
  const reserveOut = 2_000_000n;
  const amountOut = getV2AmountOut(amountIn, reserveIn, reserveOut, 9970n, 10000n);
  const expected = (amountIn * 9970n * reserveOut) / (reserveIn * 10000n + amountIn * 9970n);

  assert.equal(amountOut, expected, "V2 exact-input math should honor custom fee denominators");
  assert.equal(
    getV2AmountOut(amountIn, reserveIn, reserveOut, 9970n, 1000n),
    0n,
    "V2 exact-input math should reject fee numerator >= denominator",
  );
  assert.equal(
    getV2AmountIn(amountOut, reserveIn, reserveOut, 9970n, 10000n) <= amountIn,
    true,
    "V2 exact-output math should honor custom fee denominators",
  );
}

{
  const state = {
    poolId: pool,
    protocol: "UNISWAP_V2",
    tokens: [tokenA, tokenB],
    reserve0: 1_000_000n,
    reserve1: 2_000_000n,
    fee: 9970n,
    feeDenominator: 10000n,
    timestamp: 1,
  };
  const edge = {
    protocol: "UNISWAP_V2",
    protocolKind: "v2",
    poolAddress: pool,
    tokenIn: tokenA,
    tokenOut: tokenB,
    zeroForOne: true,
    stateRef: state,
  };

  assert.equal(
    simulateHop(edge, 10_000n, new Map([[pool, state]])).amountOut,
    getV2AmountOut(10_000n, state.reserve0, state.reserve1, state.fee, state.feeDenominator),
    "V2 simulator should pass the canonical fee denominator into swap math",
  );

  const spotWeight = edgeSpotLogWeight(edge);
  assert.equal(typeof spotWeight, "number");
  assert.equal(
    Math.abs(spotWeight! - (Math.log(2) + Math.log(0.997))) < 1e-12,
    true,
    "V2 route spot weights should use feeNumerator / feeDenominator",
  );
}

{
  const state = {
    poolId: pool,
    protocol: "UNISWAP_V2",
    tokens: [tokenA, tokenB],
    reserve0: 1_000_000n,
    reserve1: 2_000_000n,
    fee: 9970n,
    feeDenominator: 10000n,
    timestamp: 1,
  };
  const graph = buildGraph([
    {
      status: "active",
      pool_address: pool,
      protocol: "UNISWAP_V2",
      tokens: [tokenA, tokenB],
      metadata: { feeNumerator: 9970, feeDenominator: 10000 },
    },
  ], new Map([[pool, state]]));
  const edge = graph.getPoolEdge(pool, tokenA, tokenB);

  assert.equal(edge.fee, 9970);
  assert.equal(edge.feeDenominator, 10000);
  assert.equal(edge.feeBps, 30);

  const workerGraph = deserializeTopology(serializeTopology(graph));
  const workerEdge = workerGraph.getPoolEdge(pool, tokenA, tokenB);
  assert.equal(
    edgeSpotLogWeight(workerEdge) !== null,
    true,
    "serialized worker topologies should retain enough state to rank and prune V2 routes",
  );
}

{
  const state: any = {
    poolId: pool,
    protocol: "UNISWAP_V2",
    tokens: [tokenA, tokenB],
    timestamp: 1,
  };
  updateV2State(
    state,
    {
      body: [
        { val: "1000000" },
        { val: "2000000" },
      ],
    },
    {
      metadata: {
        feeNumerator: "9970",
        feeDenominator: "10000",
      },
    },
  );

  assert.equal(state.fee, 9970n);
  assert.equal(state.feeDenominator, 10000n);
  assert.equal(validatePoolState(state).valid, true);
}

console.log("Uni V2 checks passed.");
