import assert from "node:assert/strict";

import { seedNewPoolsIntoStateCache } from "../src/runtime/discovery_refresh.ts";

const poolA = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const poolB = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const token0 = "0x1111111111111111111111111111111111111111";
const token1 = "0x2222222222222222222222222222222222222222";

{
  const stateCache = new Map<string, Record<string, unknown>>([
    [poolA, { poolId: poolA, protocol: "UNISWAP_V2", tokens: [token0, token1], timestamp: 123 }],
  ]);

  const newPools = seedNewPoolsIntoStateCache(
    [
      {
        pool_address: poolA.toUpperCase(),
        protocol: "UNISWAP_V2",
        tokens: [token0, token1],
      },
      {
        pool_address: "not-a-pool-address",
        protocol: "UNISWAP_V2",
        tokens: [token0, token1],
      },
      {
        pool_address: poolB.toUpperCase(),
        protocol: "UNISWAP_V2",
        tokens: [token0.toUpperCase(), token1],
      },
    ],
    stateCache,
  );

  assert.equal(newPools.length, 1, "state seeding should skip duplicate and malformed pool addresses");
  assert.equal(newPools[0]?.pool_address, poolB, "new pool records should be returned with canonical addresses");
  assert.equal(stateCache.has(poolA.toUpperCase()), false, "mixed-case duplicates must not create a second state key");
  assert.equal(stateCache.has(poolB), true, "new pools should be keyed by canonical lowercase address");
  assert.deepEqual(stateCache.get(poolB), {
    poolId: poolB,
    protocol: "UNISWAP_V2",
    tokens: [token0, token1],
    timestamp: 0,
  });
}

console.log("Discovery refresh checks passed.");
