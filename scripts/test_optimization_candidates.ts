import assert from "node:assert/strict";

import { selectOptimizationCandidates } from "../src/routing/optimization_candidates.ts";

function candidate(id: string, profit: bigint) {
  const startToken = "0xtoken";
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
      logWeight: Number(profit),
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

const unsorted = [
  candidate("dead-logweight", 0n),
  candidate("low", 1n),
  candidate("high", 100n),
  candidate("mid", 10n),
];
unsorted[0].path.logWeight = -1_000_000;

const underLimit = selectOptimizationCandidates(unsorted, 10, {
  gasPriceWei: 1n,
  getTokenToMaticRate: () => 1n,
});

assert.deepEqual(
  underLimit.map((entry) => entry.result.profit),
  [100n, 10n, 1n],
  "candidate selection should rank viable positive-profit inputs before assessment",
);

const tightLimit = selectOptimizationCandidates(unsorted, 3, {
  gasPriceWei: 1n,
  getTokenToMaticRate: () => 1n,
});

assert.deepEqual(
  tightLimit.map((entry) => entry.result.profit),
  [100n, 10n, 1n],
  "non-profitable candidates should not crowd out viable candidates when the shortlist is tight",
);

assert.deepEqual(
  selectOptimizationCandidates(unsorted, 0, {
    gasPriceWei: 1n,
    getTokenToMaticRate: () => 1n,
  }),
  [],
  "non-positive candidate limits should not leak a candidate through selection",
);

assert.deepEqual(
  selectOptimizationCandidates([candidate("zero", 0n), candidate("negative", -1n)], 10, {
    gasPriceWei: 1n,
    getTokenToMaticRate: () => 1n,
  }),
  [],
  "candidate selection should skip batches with no positive-profit candidates",
);

console.log("Optimization candidate checks passed.");
