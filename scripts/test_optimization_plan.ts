import assert from "node:assert/strict";

import { selectOptimizationCandidates, shouldOptimizeCandidate } from "../src/routing/optimization_candidates.ts";

function makeCandidate(id: string, options: {
  startToken?: string;
  profit: bigint;
  amountIn: bigint;
  amountOut?: bigint;
  totalGas?: number;
  logWeight?: number;
  protocol?: string;
}) {
  const startToken = options.startToken ?? `0x${id.slice(2).padEnd(40, "1")}`;
  const tokenMid = `0x${id.slice(2).padEnd(40, "2")}`;
  const tokenOut = `0x${id.slice(2).padEnd(40, "3")}`;
  return {
    id,
    path: {
      startToken,
      hopCount: 2,
      logWeight: options.logWeight ?? -0.1,
      edges: [
        {
          poolAddress: `0x${id.slice(2).padEnd(40, "a")}`,
          tokenIn: startToken,
          tokenOut: tokenMid,
          protocol: options.protocol ?? "UNISWAP_V2",
        },
        {
          poolAddress: `0x${id.slice(2).padEnd(40, "b")}`,
          tokenIn: tokenMid,
          tokenOut,
          protocol: options.protocol ?? "SUSHISWAP_V2",
        },
      ],
    },
    result: {
      profitable: true,
      amountIn: options.amountIn,
      amountOut: options.amountOut ?? options.amountIn + options.profit,
      profit: options.profit,
      totalGas: options.totalGas ?? 100_000,
    },
  };
}

const gasPriceWei = 30n * 10n ** 9n;
const lowRateToken = "0x0000000000000000000000000000000000000001";
const highRateToken = "0x0000000000000000000000000000000000000002";

const candidates = [
  makeCandidate("0x1000000000000000000000000000000000000000", {
    startToken: lowRateToken,
    profit: 1_000_000n,
    amountIn: 10_000_000n,
    totalGas: 300_000,
    logWeight: -0.10,
  }),
  makeCandidate("0x2000000000000000000000000000000000000000", {
    startToken: highRateToken,
    profit: 200_000n,
    amountIn: 500_000n,
    totalGas: 50_000,
    logWeight: -0.20,
  }),
  makeCandidate("0x3000000000000000000000000000000000000000", {
    startToken: lowRateToken,
    profit: 900_000n,
    amountIn: 12_000_000n,
    totalGas: 300_000,
    logWeight: -0.05,
  }),
  makeCandidate("0x4000000000000000000000000000000000000000", {
    startToken: lowRateToken,
    profit: 260_000n,
    amountIn: 2_000_000n,
    totalGas: 120_000,
    logWeight: -0.04,
  }),
  makeCandidate("0x5000000000000000000000000000000000000000", {
    startToken: lowRateToken,
    profit: 200_000n,
    amountIn: 5_000_000n,
    totalGas: 100_000,
    logWeight: -0.03,
  }),
  makeCandidate("0x6000000000000000000000000000000000000000", {
    startToken: lowRateToken,
    profit: 150_000n,
    amountIn: 4_000_000n,
    totalGas: 100_000,
    logWeight: -0.02,
  }),
];

const shortlisted = selectOptimizationCandidates(candidates, 5, {
  gasPriceWei,
  getTokenToMaticRate(tokenAddress) {
    if (tokenAddress === highRateToken) return 10n ** 12n;
    return 1n;
  },
});

assert.equal(shortlisted.length, 5, "shortlist should respect the requested limit");
assert(
  shortlisted.some((entry) => entry.id === candidates[1].id),
  "shortlist should include a score-favored candidate with lower raw profit",
);

const bestQuickProfit = shortlisted[0]?.result.profit ?? 0n;
const optimizedIds = shortlisted
  .map((entry, index) => ({ entry, optimize: shouldOptimizeCandidate(entry, index, shortlisted.length, bestQuickProfit) }))
  .filter((entry) => entry.optimize)
  .map((entry) => entry.entry.id);

assert(
  optimizedIds.includes(shortlisted[0].id),
  "top shortlisted candidate should always be optimized",
);
assert(
  optimizedIds.length >= Math.min(3, shortlisted.length),
  "front of the shortlist should be optimized aggressively",
);

console.log("Optimization plan checks passed.");
