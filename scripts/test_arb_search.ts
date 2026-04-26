import assert from "node:assert/strict";

import { createArbSearcher, toRouteResultLike } from "../src/arb/search.ts";

{
  const result = toRouteResultLike({
    amountIn: "1000",
    amountOut: "1125",
    totalGas: "210000",
    hopAmounts: ["1000", "1050", "1125"] as any,
  });

  assert.equal(result.profit, 125n, "missing profit should be derived from amountOut - amountIn");
  assert.equal(result.profitable, true, "missing profitable flag should be derived from normalized profit");
  assert.equal(result.totalGas, 210000, "string gas estimates should normalize to safe integers");
  assert.equal(result.hopCount, 2, "hop count should be derived from hopAmounts when available");
}

{
  const result = toRouteResultLike({
    amountIn: 1000n,
    amountOut: 1125n,
    profit: 125n,
    totalGas: 100_000,
    hopCount: "3",
  });

  assert.equal(result.hopCount, 3, "explicit result hopCount should survive normalization when no structural trace exists");
}

{
  const result = toRouteResultLike({
    amountIn: 1000n,
    amountOut: 1125n,
    profit: 125n,
    totalGas: 100_000,
    hopCount: "2.5",
  });

  assert.equal(result.hopCount, 0, "malformed explicit hopCount should be preserved as an assessment-rejectable sentinel");
}

{
  const result = toRouteResultLike({
    amountIn: 1000n,
    amountOut: 900n,
    totalGas: 0,
  });

  assert.equal(result.profit, -100n);
  assert.equal(result.profitable, false);
}

{
  const result = toRouteResultLike({
    amountIn: 1000n,
    amountOut: 1125n,
    profit: "not-a-profit",
    totalGas: 100_000,
  });

  assert.equal(
    result.profit,
    0n,
    "explicit malformed profit should be preserved as an assessment-rejectable mismatch",
  );
}

{
  const result = toRouteResultLike({
    amountIn: 1000n,
    amountOut: 1125n,
    profit: 10n,
    totalGas: "10.5",
  });

  assert.equal(result.profit, 10n, "explicit mismatched profit should be preserved for assessment rejection");
  assert.equal(result.totalGas, -1, "invalid gas should normalize to an assessment-rejectable sentinel");
}

console.log("Arb search normalization checks passed.");

{
  const tokenA = "0x1111111111111111111111111111111111111111";
  const tokenB = "0x2222222222222222222222222222222222222222";
  const poolA = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const probes: bigint[] = [];
  let pathsEvaluated = 0;
  const path = {
    startToken: tokenA,
    hopCount: 2,
    logWeight: 0,
    edges: [
      {
        poolAddress: poolA,
        tokenIn: tokenA,
        tokenOut: tokenB,
        protocol: "QUICKSWAP_V2",
        zeroForOne: true,
      },
      {
        poolAddress: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        tokenIn: tokenB,
        tokenOut: tokenA,
        protocol: "QUICKSWAP_V2",
        zeroForOne: false,
      },
    ],
  };

  const search = createArbSearcher({
    cachedCycles: () => [path],
    topologyDirty: () => false,
    refreshCycles: async () => {},
    passCount: () => 1,
    maxPathsToOptimize: 10,
    minProfitWei: 1n,
    stateCache: new Map(),
    log: () => {},
    getCurrentFeeSnapshot: async () => ({ maxFee: 1n, effectiveGasPriceWei: 1n }),
    getFreshTokenToMaticRate: () => 1n,
    getRouteFreshness: () => ({ ok: true }),
    getProbeAmountsForToken: () => [0n, 1n, 2n, 2n, 3n, 3n],
    evaluatePathsParallel: async (_paths, _cache, probeAmount) => {
      probes.push(probeAmount);
      if (probeAmount !== 3n) return [];
      return [
        {
          path,
          result: {
            amountIn: probeAmount,
            amountOut: probeAmount + 10n,
            profit: 10n,
            profitable: true,
            totalGas: 0,
            hopAmounts: [probeAmount, probeAmount + 5n, probeAmount + 10n],
          },
        },
      ];
    },
    optimizeInputAmount: () => null,
    evaluateCandidatePipeline: async (candidates) => ({
      shortlisted: candidates,
      optimizedCandidates: 0,
      profitable: candidates.map((candidate) => ({
        ...candidate,
        assessment: {
          shouldExecute: true,
          netProfit: candidate.result.profit,
          netProfitAfterGas: candidate.result.profit,
        },
      })),
      assessmentSummary: {
        shortlisted: candidates.length,
        assessed: candidates.length,
        missingTokenRates: 0,
        optimizedCandidates: 0,
        secondChanceOptimized: 0,
        profitable: candidates.length,
        rejected: 0,
        rejectReasons: {},
      },
    }),
    partitionFreshCandidates: (candidates) => ({ fresh: candidates, stale: [] }),
    filterQuarantinedCandidates: (candidates) => candidates,
    routeCacheUpdate: () => {},
    routeKeyFromEdges: (startToken, edges) => `${startToken}:${edges.map((edge) => edge.poolAddress).join(">")}`,
    fmtPath: () => "test-route",
    fmtProfit: (profit) => String(profit),
    onPathsEvaluated: (count) => {
      pathsEvaluated += count;
    },
    onCandidateMetrics: () => {},
    onArbsFound: () => {},
    workerCount: 1,
  });

  const found = await search();

  assert.deepEqual(
    probes,
    [1n, 2n, 3n],
    "arb search should dedupe positive probes without stopping before later profitable probe sizes",
  );
  assert.equal(
    pathsEvaluated,
    3,
    "arb search should count actual path evaluations across probe sizes, not only unique cycles",
  );
  assert.equal(found.length, 1);
  assert.equal(found[0].result.amountIn, 3n);
}
