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
  candidate("low", 1n),
  candidate("high", 100n),
  candidate("mid", 10n),
];

const underLimit = selectOptimizationCandidates(unsorted, 10, {
  gasPriceWei: 1n,
  getTokenToMaticRate: () => 1n,
});

assert.deepEqual(
  underLimit.map((entry) => entry.result.profit),
  [100n, 10n, 1n],
  "candidate selection should rank under-limit inputs before assessment",
);

assert.deepEqual(
  selectOptimizationCandidates(unsorted, 0, {
    gasPriceWei: 1n,
    getTokenToMaticRate: () => 1n,
  }),
  [],
  "non-positive candidate limits should not leak a candidate through selection",
);

console.log("Optimization candidate checks passed.");
