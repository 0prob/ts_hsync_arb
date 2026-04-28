import assert from "node:assert/strict";

import { WorkerPool, __workerPoolTest } from "../src/routing/worker_pool.ts";

function address(index: number) {
  return `0x${index.toString(16).padStart(40, "0")}`;
}

function path(poolAddresses: string[]) {
  return {
    startToken: address(900),
    hopCount: poolAddresses.length,
    logWeight: 1,
    edges: poolAddresses.map((poolAddress, index) => ({
      poolAddress,
      tokenIn: address(1000 + index),
      tokenOut: address(1100 + index),
      protocol: "UNISWAP_V2",
      zeroForOne: true,
    })),
  };
}

{
  const poolA = address(1);
  const poolB = address(2);
  const stateA = { timestamp: 10, reserve0: 1n, reserve1: 2n };
  const stateB = { timestamp: 20, reserve0: 3n, reserve1: 4n };
  const stateCache = new Map<string, Record<string, unknown>>([
    [poolA, stateA],
    [poolB, stateB],
  ]);

  const collected = __workerPoolTest.collectChunkPoolState(
    [
      path([poolA.toUpperCase(), poolB, "not-a-pool"]),
      path([poolA, poolB.toUpperCase()]),
    ],
    stateCache,
  );

  assert.deepEqual(
    collected.poolAddresses,
    [poolA, poolB],
    "worker chunk pool collection should normalize and dedupe addresses in first-seen order",
  );
  assert.deepEqual(
    collected.statePoolAddresses,
    [poolA, poolB],
    "worker retained-pool collection should include only pools with live state",
  );
  assert.deepEqual(collected.stateObj, {
    [poolA]: stateA,
    [poolB]: stateB,
  });
}

{
  const poolA = address(1);
  const poolB = address(2);
  const stateA = { timestamp: 10, reserve0: 1n, reserve1: 2n };
  const stateCache = new Map<string, Record<string, unknown>>([
    [poolA, stateA],
  ]);

  const collected = __workerPoolTest.collectChunkPoolState(
    [path([poolA, poolB])],
    stateCache,
  );

  assert.deepEqual(
    collected.poolAddresses,
    [poolA, poolB],
    "worker chunk pool collection should still report every path pool for locality",
  );
  assert.deepEqual(
    collected.statePoolAddresses,
    [poolA],
    "worker retained-pool collection should exclude path pools whose state disappeared",
  );

  const pool = new WorkerPool(1) as any;
  const delta = pool._buildStateDelta(
    [path([poolA, poolB])],
    stateCache,
    new Map([[poolA, 10], [poolB, 20]]),
  );

  assert.deepEqual(
    delta.retainPools,
    [poolA],
    "worker state mirror should evict previously synced pools that are missing from stateCache",
  );
  assert.deepEqual(delta.delta, {});
}

console.log("Worker pool collect checks passed.");
