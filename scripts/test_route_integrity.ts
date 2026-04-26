import assert from "node:assert/strict";

import { buildArbTx, gasEstimateCacheKeyForRoute } from "../src/execution/build_tx.ts";
import {
  routeExecutionCacheKey,
  routeIdentityFromEdges,
  routeIdentityFromSerializedPath,
} from "../src/routing/route_identity.ts";

const tokenA = "0x1111111111111111111111111111111111111111";
const tokenB = "0x2222222222222222222222222222222222222222";
const poolA = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const poolB = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const executor = "0x3333333333333333333333333333333333333333";
const sender = "0x4444444444444444444444444444444444444444";

function makeRoute(overrides: any = {}) {
  const edges = overrides.edges ?? [
    {
      protocol: "QUICKSWAP_V2",
      poolAddress: ` ${poolA.toUpperCase()} `,
      tokenIn: tokenA.toUpperCase(),
      tokenOut: tokenB,
      zeroForOne: true,
    },
    {
      protocol: "SUSHISWAP_V2",
      poolAddress: poolB,
      tokenIn: tokenB,
      tokenOut: tokenA,
      zeroForOne: false,
    },
  ];
  const result = overrides.result ?? {
    amountIn: 1000n,
    amountOut: 1100n,
    profit: 100n,
    profitable: true,
    hopAmounts: [1000n, 1050n, 1100n],
    tokenPath: [tokenA, tokenB.toUpperCase(), tokenA.toUpperCase()],
    poolPath: [poolA, poolB.toUpperCase()],
  };

  return {
    path: {
      startToken: tokenA.toUpperCase(),
      hopCount: 99,
      edges,
    },
    result,
  };
}

{
  const edges = makeRoute().path.edges;
  const identity = routeIdentityFromEdges(tokenA.toUpperCase(), edges);
  assert.equal(
    identity,
    routeIdentityFromSerializedPath(
      tokenA,
      [poolA, poolB],
      [tokenA, tokenB],
      [tokenB, tokenA],
    ),
    "route identity should canonicalize equivalent mixed-case and padded addresses",
  );
  assert.equal(
    gasEstimateCacheKeyForRoute(makeRoute()),
    routeExecutionCacheKey(tokenA, edges.length, edges),
    "gas estimate route keys should use canonical route identity and edge-derived hop count",
  );
  assert.equal(
    gasEstimateCacheKeyForRoute(makeRoute(), {
      fromAddress: sender.toUpperCase(),
      executorAddress: ` ${executor.toUpperCase()} `,
      callCount: 4,
    }),
    `gas:${sender}:${executor}:calls=4:${routeExecutionCacheKey(tokenA, edges.length, edges)}`,
    "gas estimate route keys should support a stable sender/executor context without deadline-sensitive tx data",
  );

  assert.throws(
    () => routeIdentityFromSerializedPath(tokenA, [poolA], [tokenA, tokenB], [tokenB]),
    /length mismatch/i,
    "serialized route identity should reject mismatched segment arrays",
  );
  assert.throws(
    () => routeIdentityFromEdges(tokenA, [{ ...edges[0], poolAddress: "not-a-pool" }]),
    /valid poolAddress/i,
    "route identity should reject malformed route addresses",
  );
  assert.throws(
    () =>
      gasEstimateCacheKeyForRoute(makeRoute(), {
        fromAddress: "not-a-sender",
        executorAddress: executor,
        callCount: 4,
      }),
    /valid fromAddress/i,
    "contextual gas estimate keys should reject malformed sender addresses",
  );
  assert.throws(
    () =>
      gasEstimateCacheKeyForRoute(makeRoute(), {
        fromAddress: sender,
        executorAddress: executor,
        callCount: 0,
      }),
    /callCount must be a positive integer/i,
    "contextual gas estimate keys should reject invalid call counts",
  );
}

{
  const built = await buildArbTx(
    makeRoute(),
    { executorAddress: executor, fromAddress: sender },
    {
      gasParamsOverride: {
        maxFeePerGas: 1n,
        maxPriorityFeePerGas: 1n,
        gasLimit: 1_000_000n,
        estimatedCostWei: 1_000_000n,
      },
    },
  );
  assert.equal(built.to.toLowerCase(), executor);
  assert.equal(built.meta.flashToken.toLowerCase(), tokenA);
  assert.equal(built.meta.pools.length, 2);
  assert.equal(
    built.gasEstimateCacheKey,
    gasEstimateCacheKeyForRoute(makeRoute(), {
      fromAddress: sender,
      executorAddress: executor,
      callCount: built.meta.callCount,
    }),
    "buildArbTx should use the stable route gas estimate key by default",
  );
}

await assert.rejects(
  () =>
    buildArbTx(
      makeRoute({
        result: {
          ...makeRoute().result,
          tokenPath: [tokenA, tokenB, tokenB],
        },
      }),
      { executorAddress: executor, fromAddress: sender },
      { gasParamsOverride: { maxFeePerGas: 1n, maxPriorityFeePerGas: 1n, gasLimit: 1n, estimatedCostWei: 1n } },
    ),
  /tokenPath must end with path.startToken/i,
  "execution validation should reject routes that do not close back to the flash token",
);

await assert.rejects(
  () =>
    buildArbTx(
      makeRoute({
        result: {
          ...makeRoute().result,
          hopAmounts: [999n, 1050n, 1100n],
        },
      }),
      { executorAddress: executor, fromAddress: sender },
      { gasParamsOverride: { maxFeePerGas: 1n, maxPriorityFeePerGas: 1n, gasLimit: 1n, estimatedCostWei: 1n } },
    ),
  /hopAmounts must start with amountIn/i,
  "execution validation should reject routes whose hop amount trace does not start at amountIn",
);

await assert.rejects(
  () =>
    buildArbTx(
      makeRoute({
        edges: [{ ...makeRoute().path.edges[0], poolAddress: "not-a-pool" }, makeRoute().path.edges[1]],
      }),
      { executorAddress: executor, fromAddress: sender },
      { gasParamsOverride: { maxFeePerGas: 1n, maxPriorityFeePerGas: 1n, gasLimit: 1n, estimatedCostWei: 1n } },
    ),
  /invalid route address/i,
  "execution validation should reject malformed route edge addresses",
);

console.log("Route integrity checks passed.");
