import assert from "node:assert/strict";

import { createRouteRevalidator } from "../src/arb/route_revalidation.ts";

const ADDRESS = "0x0000000000000000000000000000000000000001";

function makePath() {
  return {
    startToken: ADDRESS,
    hopCount: 2,
    logWeight: 0,
    edges: [
      {
        poolAddress: "0x00000000000000000000000000000000000000aa",
        tokenIn: ADDRESS,
        tokenOut: "0x0000000000000000000000000000000000000002",
        protocol: "UNISWAP_V2",
        zeroForOne: true,
      },
      {
        poolAddress: "0x00000000000000000000000000000000000000bb",
        tokenIn: "0x0000000000000000000000000000000000000002",
        tokenOut: ADDRESS,
        protocol: "SUSHISWAP_V2",
        zeroForOne: false,
      },
    ],
  };
}

{
  const path = makePath();
  let optimized = 0;
  let executed = 0;

  const revalidateCachedRoutes = createRouteRevalidator({
    getAffectedRoutes: () => [
      {
        path,
        result: {
          amountIn: 1_000n,
          amountOut: 1_020n,
          profit: 20n,
          totalGas: 100_000,
        },
      },
    ],
    stateCache: new Map(),
    testAmountWei: 1_000n,
    minProfitWei: 1n,
    maxExecutionBatch: 1,
    log: () => {},
    getCurrentFeeSnapshot: async () => ({ maxFee: 1n }),
    getFreshTokenToMaticRate: () => 1n,
    getRouteFreshness: () => ({ ok: true }),
    simulateRoute: () => ({
      amountIn: 1_000n,
      amountOut: 1_020n,
      profit: 20n,
      totalGas: 100_000,
    }),
    optimizeInputAmount: () => {
      optimized++;
      return {
        amountIn: 10_000n,
        amountOut: 130_000n,
        profit: 120_000n,
        totalGas: 100_000,
        profitable: true,
      };
    },
    filterQuarantinedCandidates: (candidates) => candidates,
    executeBatchIfIdle: async (candidates) => {
      executed += candidates.length;
    },
  });

  await revalidateCachedRoutes(new Set(["0x00000000000000000000000000000000000000aa"]));

  assert.equal(
    optimized,
    1,
    "fast revalidation should optimize a cached route before rejecting a failed quick assessment",
  );
  assert.equal(
    executed,
    1,
    "fast revalidation should execute a route that becomes profitable only at the optimized amount",
  );
}

console.log("Route revalidation checks passed.");
