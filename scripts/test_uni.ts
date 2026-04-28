import assert from "node:assert/strict";

import { getV2AmountIn, getV2AmountOut } from "../src/math/uniswap_v2.ts";
import { buildGraph, deserializeTopology, serializeTopology } from "../src/routing/graph.ts";
import { edgeSpotLogWeight } from "../src/routing/finder.ts";
import { simulateHop, simulateRoute } from "../src/routing/simulator.ts";
import { normalizePoolState, validatePoolState } from "../src/state/normalizer.ts";
import { fetchMultipleV2StatesWithDeps } from "../src/state/uniswap_v2.ts";
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

  assert.equal(
    simulateHop({ ...edge, poolAddress: ` ${pool.toUpperCase()} `, stateRef: undefined }, 10_000n, new Map([[pool, state]])).amountOut,
    getV2AmountOut(10_000n, state.reserve0, state.reserve1, state.fee, state.feeDenominator),
    "V2 simulator should normalize pool addresses when falling back to stateCache",
  );

  const mixedCaseRoute = simulateRoute(
    {
      startToken: tokenA.toUpperCase(),
      edges: [
        { ...edge, tokenIn: tokenA, tokenOut: tokenB.toUpperCase() },
        {
          ...edge,
          tokenIn: tokenB,
          tokenOut: tokenA.toUpperCase(),
          zeroForOne: false,
        },
      ],
      hopCount: 2,
    },
    10_000n,
    new Map([[pool, state]]),
  );
  assert.equal(
    mixedCaseRoute.tokenPath.length,
    3,
    "route simulation should accept mixed-case EVM tokens without falling out of the fast validation path",
  );

  const invalidTokenRoute = simulateRoute(
    {
      startToken: "not-a-token",
      edges: [{ ...edge, tokenIn: "not-a-token", tokenOut: "not-a-token" }],
      hopCount: 1,
    },
    10_000n,
    new Map([[pool, state]]),
  );
  assert.equal(
    invalidTokenRoute.amountOut,
    0n,
    "route simulation should not fast-accept invalid token identifiers",
  );

  const spotWeight = edgeSpotLogWeight(edge);
  assert.equal(typeof spotWeight, "number");
  assert.equal(
    Math.abs(spotWeight! - (Math.log(2) + Math.log(0.997))) < 1e-12,
    true,
    "V2 route spot weights should use feeNumerator / feeDenominator",
  );

  const openRoute = simulateRoute(
    {
      startToken: tokenA,
      edges: [edge],
      hopCount: 1,
    },
    10_000n,
    new Map([[pool, state]]),
  );
  assert.equal(
    openRoute.profitable,
    false,
    "route simulation should fail closed for paths that do not return to startToken",
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
  assert.equal(
    graph.getPoolEdge(pool.toUpperCase(), tokenA.toUpperCase(), tokenB.toUpperCase()),
    edge,
    "routing graph pool-edge lookup should normalize checksummed or uppercase addresses",
  );
  assert.equal(
    graph.getEdges(tokenA.toUpperCase()).length,
    graph.getEdges(tokenA).length,
    "routing graph adjacency lookup should normalize token addresses",
  );
  assert.equal(
    graph.getEdgesBetween(tokenA.toUpperCase(), tokenB.toUpperCase())[0],
    edge,
    "routing graph edge-pair lookup should normalize both token addresses",
  );
  assert.equal(graph.hasToken(tokenA.toUpperCase()), true);

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

{
  const pool2 = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const emptyPool = "0xcccccccccccccccccccccccccccccccccccccccc";
  const seenBatchSizes: number[] = [];
  const states = await fetchMultipleV2StatesWithDeps(
    [pool, pool2, emptyPool, pool],
    10,
    {
      multicall: async ({ contracts }: any) => {
        seenBatchSizes.push(contracts.length);
        return contracts.map((contract: any, index: number) => {
          if (contract.address === emptyPool) {
            return { status: "failure", error: new Error('execution reverted: returned no data ("0x")') };
          }
          return {
            status: "success",
            result: [BigInt(index + 1), BigInt(index + 2), 1234],
          };
        });
      },
    },
  );

  assert.equal(seenBatchSizes.length, 1, "V2 reserve hydration should batch pools through multicall");
  assert.equal(seenBatchSizes[0], 3, "V2 reserve hydration should dedupe duplicate pool addresses");
  assert.equal(states.size, 2);
  assert.equal(states.get(pool)?.reserve0, 1n);
  assert.deepEqual([...(states.noDataFailures ?? [])], [emptyPool]);
}

console.log("Uni V2 checks passed.");
