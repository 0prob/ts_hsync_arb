import assert from "node:assert/strict";

import { routeKeyFromEdges } from "../src/routing/finder.ts";
import { routeExecutionCacheKey, routeIdentityFromEdges, routeIdentityFromSerializedPath } from "../src/routing/route_identity.ts";
import { gasEstimateCacheKeyForRoute } from "../src/execution/build_tx.ts";
import { buildFlashParams, computeRouteHash } from "../src/execution/calldata.ts";
import { RouteCache } from "../src/routing/route_cache.ts";

const startToken = "0x00000000000000000000000000000000000000AA";
const edges = [
  {
    poolAddress: "0x00000000000000000000000000000000000000B1",
    tokenIn: "0x00000000000000000000000000000000000000AA",
    tokenOut: "0x00000000000000000000000000000000000000BB",
  },
  {
    poolAddress: "0x00000000000000000000000000000000000000C2",
    tokenIn: "0x00000000000000000000000000000000000000BB",
    tokenOut: "0x00000000000000000000000000000000000000AA",
  },
] as const;

const serialisedIdentity = routeIdentityFromSerializedPath(
  startToken,
  edges.map((edge) => edge.poolAddress),
  edges.map((edge) => edge.tokenIn),
  edges.map((edge) => edge.tokenOut),
);
const edgeIdentity = routeIdentityFromEdges(startToken, [...edges]);

assert.equal(edgeIdentity, serialisedIdentity, "serialised and edge-based route identity should match");
assert.equal(routeKeyFromEdges(startToken, [...edges]), edgeIdentity, "routeKeyFromEdges should use canonical route identity");
assert.equal(
  routeExecutionCacheKey(startToken, edges.length, [...edges]),
  `arb:${edges.length}:${edgeIdentity}`,
  "execution cache key should be derived from the canonical route identity",
);

const route = {
  path: {
    startToken,
    hopCount: edges.length,
    edges: [...edges],
  },
};
assert.equal(
  gasEstimateCacheKeyForRoute(route),
  routeExecutionCacheKey(startToken, edges.length, [...edges]),
  "gas estimate cache key should use the canonical execution route key",
);
assert.equal(
  gasEstimateCacheKeyForRoute({
    path: {
      startToken,
      hopCount: 99,
      edges: [...edges],
    },
  }),
  gasEstimateCacheKeyForRoute(route),
  "gas estimate cache key should derive hop count from edges, not stale path metadata",
);

const reversedEdges = [...edges].reverse();
assert.notEqual(
  routeIdentityFromEdges(startToken, reversedEdges),
  edgeIdentity,
  "route identity must remain order-sensitive",
);
assert.notEqual(
  gasEstimateCacheKeyForRoute({
    path: { startToken, hopCount: reversedEdges.length, edges: reversedEdges },
  }),
  gasEstimateCacheKeyForRoute(route),
  "gas estimate cache keys must differ when route order differs",
);

const calls = [
  {
    target: "0x0000000000000000000000000000000000000010",
    value: 0n,
    data: "0x1234",
  },
  {
    target: "0x0000000000000000000000000000000000000020",
    value: 0n,
    data: "0xabcd",
  },
];

const routeHash = computeRouteHash(calls);
assert.equal(
  buildFlashParams({
    profitToken: startToken,
    minProfit: 1n,
    deadline: 2n,
    calls,
  }).routeHash,
  routeHash,
  "flash params should embed the computed route hash",
);
assert.notEqual(
  computeRouteHash([...calls].reverse()),
  routeHash,
  "route hash must remain order-sensitive for calldata execution",
);

const routeCache = new RouteCache(4);
routeCache.update([
  {
    path: {
      startToken,
      edges: [
        {
          ...edges[0],
          poolAddress: edges[0].poolAddress.toUpperCase(),
        },
        edges[1],
      ],
    },
    result: { profit: 123n },
  },
]);
assert.equal(
  routeCache.getByPools(new Set([edges[0].poolAddress.toLowerCase()])).length,
  1,
  "route cache lookups should be case-insensitive for changed pool addresses",
);

console.log("Route identity checks passed.");
