import assert from "node:assert/strict";

import { evaluateCandidatePipeline } from "../src/routing/candidate_pipeline.ts";

const optimizedProfits: bigint[] = [];

function candidate(id: string, profit: bigint, startToken = "0xtoken") {
  return {
    path: {
      startToken,
      hopCount: 2,
      edges: [
        {
          poolAddress: `0xpool-${id}`,
          tokenIn: startToken,
          tokenOut: startToken,
          protocol: "TEST",
        },
      ],
      logWeight: 0,
    },
    result: {
      amountIn: 1_000n,
      amountOut: 1_000n + profit,
      profit,
      profitable: profit > 0n,
      totalGas: 100_000,
    },
  };
}

const result = await evaluateCandidatePipeline(
  [
    candidate("missing-rate", 50n, "0xmissing"),
    candidate("profitable", 100n),
    candidate("rejected", 0n),
    candidate("needs-second-chance", 5n),
  ],
  {
    shortlistLimit: 10,
    gasPriceWei: 1n,
    getTokenToMaticRate: (tokenAddress: string) => tokenAddress === "0xmissing" ? 0n : 1n,
    optimizePath: (_path, quickResult) => {
      optimizedProfits.push(quickResult.profit);
      if (quickResult.profit === 5n) {
        return {
          ...quickResult,
          amountOut: quickResult.amountIn + 200n,
          profit: 200n,
          profitable: true,
        };
      }
      return null;
    },
    assessRoute: (_path, routeResult) => ({
      shouldExecute: routeResult.profit >= 100n,
      rejectReason: routeResult.profit < 100n ? "below_min_profit" : "",
      netProfitAfterGas: routeResult.profit,
    }),
  },
);

assert.equal(result.profitable.length, 2);
assert.equal(result.assessmentSummary.shortlisted, 4);
assert.equal(result.assessmentSummary.missingTokenRates, 1);
assert.equal(result.assessmentSummary.assessed, 3);
assert.equal(result.assessmentSummary.optimizedCandidates, 2);
assert.equal(result.assessmentSummary.secondChanceOptimized, 0);
assert.equal(result.assessmentSummary.profitable, 2);
assert.equal(result.assessmentSummary.rejected, 1);
assert.deepEqual(result.assessmentSummary.rejectReasons, {
  below_min_profit: 1,
});
assert.deepEqual(optimizedProfits, [100n, 5n]);

console.log("Candidate pipeline assessment checks passed.");
