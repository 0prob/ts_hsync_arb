import assert from "node:assert/strict";

import { RouteCache } from "../src/routing/route_cache.ts";

const poolA = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const poolB = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const tokenA = "0x1111111111111111111111111111111111111111";
const tokenB = "0x2222222222222222222222222222222222222222";

function route(poolAddress: string, profit: bigint | string = 10n) {
  return {
    path: {
      startToken: tokenA,
      edges: [
        {
          poolAddress,
          tokenIn: tokenA,
          tokenOut: tokenB,
        },
      ],
    },
    result: { profit },
  };
}

function assessedRoute(poolAddress: string, grossProfit: bigint, netProfitAfterGas: bigint) {
  return {
    ...route(poolAddress, grossProfit),
    assessment: {
      netProfitAfterGas,
      netProfit: netProfitAfterGas,
    },
  };
}

{
  const cache = new RouteCache(10);

  cache.update([
    route(` ${poolA.toUpperCase()} `, "100"),
    route("not-a-pool", "200"),
    route(poolB, "not-a-bigint"),
  ]);

  assert.equal(cache.size, 1, "RouteCache should skip malformed pool keys and malformed profit entries");
  assert.equal(
    cache.getByPools([poolA]).length,
    1,
    "RouteCache should index valid routes under normalized pool keys",
  );
  assert.equal(
    cache.getByPools([` ${poolA.toUpperCase()} `]).length,
    1,
    "RouteCache lookups should normalize changed pool keys",
  );
  assert.equal(
    cache.getByPools(["not-a-pool"]).length,
    0,
    "RouteCache lookups should ignore malformed changed pool keys",
  );

  cache.prune(new Map([[` ${poolA.toUpperCase()} `, {}]]));
  assert.equal(cache.size, 1, "RouteCache prune should normalize state cache keys");

  assert.equal(
    cache.removeByPools([` ${poolA.toUpperCase()} `]),
    1,
    "RouteCache removeByPools should normalize blocked pool keys",
  );
  assert.equal(cache.size, 0);
}

{
  const cache = new RouteCache(2);

  cache.update([
    assessedRoute(poolA, 1_000n, 10n),
    assessedRoute(poolB, 100n, 90n),
    assessedRoute("0xcccccccccccccccccccccccccccccccccccccccc", 50n, 50n),
  ]);

  assert.equal(cache.size, 2);
  assert.equal(
    cache.getByPools([poolA]).length,
    0,
    "RouteCache should evict high-gross routes when assessed net profit is lower",
  );
  assert.equal(
    cache.getByPools([poolB]).length,
    1,
    "RouteCache should retain routes with stronger assessed net profit",
  );
}

console.log("Route cache map checks passed.");
