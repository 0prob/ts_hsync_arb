import assert from "node:assert/strict";

import { createRouteRevalidator } from "../src/arb/route_revalidation.ts";

const poolA = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const tokenA = "0x1111111111111111111111111111111111111111";
const tokenB = "0x2222222222222222222222222222222222222222";

const path = {
  startToken: tokenA,
  hopCount: 2,
  logWeight: 0,
  edges: [
    {
      poolAddress: poolA,
      tokenIn: tokenA,
      tokenOut: tokenB,
      protocol: "UNISWAP_V2",
      zeroForOne: true,
    },
  ],
};

const previousResult = {
  amountIn: 1_000n,
  amountOut: 2_000n,
  profit: 1_000n,
  profitable: true,
  totalGas: 0,
};

{
  let tokenRateLookups = 0;
  let simulations = 0;
  let optimizations = 0;
  let executions = 0;

  const revalidate = createRouteRevalidator({
    getAffectedRoutes: () => [{ path, result: previousResult }],
    stateCache: new Map(),
    testAmountWei: 1_000n,
    minProfitWei: 1n,
    maxExecutionBatch: 1,
    log: () => {},
    getCurrentFeeSnapshot: async () => ({ maxFee: 1n, effectiveGasPriceWei: 1n }),
    getFreshTokenToMaticRate: () => {
      tokenRateLookups++;
      return 1n;
    },
    getRouteFreshness: () => ({ ok: false, reason: "stale_pool_state" }),
    simulateRoute: () => {
      simulations++;
      return previousResult;
    },
    optimizeInputAmount: () => {
      optimizations++;
      return previousResult;
    },
    filterQuarantinedCandidates: (candidates) => candidates,
    executeBatchIfIdle: async () => {
      executions++;
    },
  });

  await revalidate(new Set([poolA]));

  assert.equal(tokenRateLookups, 0, "stale routes should not perform token/MATIC price lookups");
  assert.equal(simulations, 0, "stale routes should not be simulated");
  assert.equal(optimizations, 0, "stale routes should not be optimized");
  assert.equal(executions, 0, "stale routes should not execute");
}

{
  let simulations = 0;
  let executions = 0;
  let tokenRateLookups = 0;

  const revalidate = createRouteRevalidator({
    getAffectedRoutes: () => [
      { path, result: previousResult },
      { path: { ...path, edges: [{ ...path.edges[0] }] }, result: previousResult },
    ],
    stateCache: new Map(),
    testAmountWei: 1_000n,
    minProfitWei: 1n,
    maxExecutionBatch: 1,
    log: () => {},
    getCurrentFeeSnapshot: async () => ({ maxFee: 1n, effectiveGasPriceWei: 1n }),
    getFreshTokenToMaticRate: () => {
      tokenRateLookups++;
      return 1n;
    },
    getRouteFreshness: () => ({ ok: true }),
    simulateRoute: () => {
      simulations++;
      return previousResult;
    },
    optimizeInputAmount: () => previousResult,
    filterQuarantinedCandidates: (candidates) => candidates,
    executeBatchIfIdle: async (candidates) => {
      executions += candidates.length;
    },
  });

  await revalidate(new Set([poolA]));

  assert.equal(
    tokenRateLookups,
    1,
    "fresh routes sharing a start token should reuse the token/MATIC rate during revalidation",
  );
  assert.equal(simulations, 2, "fresh affected routes should still run the fast revalidation simulation");
  assert.equal(executions, 1, "fresh profitable routes should still be handed to execution");
}

console.log("Route revalidation checks passed.");
