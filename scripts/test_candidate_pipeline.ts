import assert from "node:assert/strict";

import { evaluateCandidatePipeline } from "../src/routing/candidate_pipeline.ts";

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
          zeroForOne: true,
        },
        {
          poolAddress: `0x${id.slice(2).padEnd(40, "b")}`,
          tokenIn: tokenMid,
          tokenOut,
          protocol: options.protocol ?? "SUSHISWAP_V2",
          zeroForOne: true,
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
];

const optimizedIds: string[] = [];
const assessedIds: string[] = [];

const pipeline = await evaluateCandidatePipeline(candidates, {
  shortlistLimit: 4,
  gasPriceWei,
  getTokenToMaticRate(tokenAddress) {
    if (tokenAddress === highRateToken) return 10n ** 12n;
    return 1n;
  },
  optimizePath(path, quickResult) {
    const candidate = candidates.find((entry) => entry.path === path);
    assert(candidate, "optimize callback should receive one of the shortlisted candidates");
    optimizedIds.push(candidate.id);
    return {
      ...quickResult,
      profit: quickResult.profit + 10_000n,
      amountOut: quickResult.amountOut + 10_000n,
    };
  },
  assessRoute(path, routeResult) {
    const candidate = candidates.find((entry) => entry.path === path);
    assert(candidate, "assess callback should receive one of the shortlisted candidates");
    assessedIds.push(candidate.id);
    return {
      shouldExecute: routeResult.profit >= 210_000n,
      netProfitAfterGas: routeResult.profit,
    };
  },
});

assert.equal(pipeline.shortlisted.length, 4, "pipeline should respect shortlist limit");
assert(
  pipeline.shortlisted.some((entry) => entry.id === candidates[1].id),
  "pipeline shortlist should include the score-favored low-gas candidate",
);
assert.equal(
  pipeline.optimizedCandidates,
  optimizedIds.length,
  "pipeline should report the same optimization count observed by the optimize callback",
);
assert(
  optimizedIds.length >= 3,
  "pipeline should optimize the front of the shortlist aggressively",
);
assert.equal(
  pipeline.profitable.length,
  pipeline.profitable.filter((entry) => entry.assessment.shouldExecute).length,
  "pipeline should only return candidates whose assessment passes",
);
assert.deepEqual(
  new Set(assessedIds),
  new Set(pipeline.shortlisted.map((entry) => entry.id)),
  "every shortlisted candidate with a usable token rate should be assessed",
);

console.log("Candidate pipeline checks passed.");
