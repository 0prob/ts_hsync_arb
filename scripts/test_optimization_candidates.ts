import assert from "node:assert/strict";

import { selectOptimizationCandidates } from "../src/routing/optimization_candidates.ts";

function makeCandidate(id: string, options: {
  startToken?: string;
  profit: bigint;
  amountIn: bigint;
  totalGas?: number;
  logWeight?: number;
  protocol?: string;
}) {
  const tokenIn = `${id}11`.padEnd(42, "1").slice(0, 42);
  const tokenMid = `${id}22`.padEnd(42, "2").slice(0, 42);
  const tokenOut = `${id}33`.padEnd(42, "3").slice(0, 42);
  const startToken = options.startToken ?? tokenIn;
  return {
    id,
    path: {
      startToken,
      hopCount: 2,
      logWeight: options.logWeight ?? -0.1,
      edges: [
        {
          poolAddress: `${id}aa`.padEnd(42, "a").slice(0, 42),
          tokenIn: startToken,
          tokenOut: tokenMid,
          protocol: options.protocol ?? "UNISWAP_V2",
        },
        {
          poolAddress: `${id}bb`.padEnd(42, "b").slice(0, 42),
          tokenIn: tokenMid,
          tokenOut,
          protocol: options.protocol ?? "SUSHISWAP_V2",
        },
      ],
    },
    result: {
      profitable: true,
      amountIn: options.amountIn,
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
    profit: 800_000n,
    amountIn: 11_000_000n,
    totalGas: 300_000,
    logWeight: -0.04,
  }),
  makeCandidate("0x5000000000000000000000000000000000000000", {
    startToken: lowRateToken,
    profit: 700_000n,
    amountIn: 9_000_000n,
    totalGas: 300_000,
    logWeight: -0.03,
  }),
];

const selected = selectOptimizationCandidates(candidates, 3, {
  gasPriceWei,
  getTokenToMaticRate(tokenAddress) {
    if (tokenAddress === highRateToken) return 10n ** 12n;
    return 1n;
  },
});

assert.equal(selected.length, 3, "selector should respect the limit");
assert(
  selected.some((entry) => entry.id === candidates[1].id),
  "score-based selection should preserve a high-quality low-gas candidate even when raw profit is lower",
);
assert(
  selected.some((entry) => entry.id === candidates[0].id),
  "profit-based selection should still preserve the top raw-profit candidate",
);

console.log("Optimization candidate checks passed.");
