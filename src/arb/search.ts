import {
  assessRouteResult,
  compareAssessmentProfit,
  getAssessmentOptimizationOptions,
  type ArbPathLike,
  type CandidateEntry,
  type ExecutableCandidate,
  type RouteResultLike,
} from "./assessment.ts";

const MIN_PROBE_AMOUNT = 1_000n;

export function toRouteResultLike(result: Record<string, any>): RouteResultLike {
  return {
    amountIn: BigInt(result.amountIn),
    amountOut: BigInt(result.amountOut),
    profit: BigInt(result.profit),
    profitable: result.profitable,
    totalGas: Number(result.totalGas ?? 0),
    poolPath: Array.isArray(result.poolPath) ? result.poolPath : undefined,
    tokenPath: Array.isArray(result.tokenPath) ? result.tokenPath : undefined,
    hopAmounts: Array.isArray(result.hopAmounts) ? result.hopAmounts.map((amount) => BigInt(amount)) : undefined,
  };
}

function mergeCandidateBatch(
  into: Map<string, CandidateEntry>,
  batch: CandidateEntry[],
  routeKeyFromEdges: (startToken: string, edges: any) => string,
) {
  for (const entry of batch) {
    const key = routeKeyFromEdges(entry.path.startToken, entry.path.edges);
    const current = into.get(key);
    if (!current || entry.result.profit > current.result.profit) {
      into.set(key, entry);
    }
  }
}

function normaliseCandidateBatch(
  batch: Array<{ path: ArbPathLike; result: Record<string, any> }>,
): CandidateEntry[] {
  return batch.map(({ path, result }) => ({
    path,
    result: toRouteResultLike(result),
  }));
}

type SearchDeps = {
  cachedCycles: () => ArbPathLike[];
  topologyDirty: () => boolean;
  refreshCycles: () => Promise<void>;
  passCount: () => number;
  maxPathsToOptimize: number;
  minProfitWei: bigint;
  stateCache: Map<string, Record<string, any>>;
  log: (msg: string, level?: "fatal" | "error" | "warn" | "info" | "debug" | "trace", meta?: any) => void;
  getCurrentFeeSnapshot: () => Promise<any>;
  getFreshTokenToMaticRate: (tokenAddress: string) => bigint;
  getRouteFreshness: (path: ArbPathLike) => { ok: boolean; reason?: string };
  getProbeAmountsForToken: (tokenAddress: string) => bigint[];
  evaluatePathsParallel: (paths: ArbPathLike[], stateCache: Map<string, Record<string, any>>, probeAmount: bigint, options: any) => Promise<any[]>;
  optimizeInputAmount: (path: ArbPathLike, stateCache: Map<string, Record<string, any>>, options: any) => RouteResultLike | null;
  evaluateCandidatePipeline: (candidates: CandidateEntry[], options: any) => Promise<{
    shortlisted: CandidateEntry[];
    optimizedCandidates: number;
    profitable: ExecutableCandidate[];
  }>;
  partitionFreshCandidates: (candidates: ExecutableCandidate[], getFreshness: (path: ArbPathLike) => any) => {
    fresh: ExecutableCandidate[];
    stale: Array<{ candidate: ExecutableCandidate; freshness: { reason?: string } }>;
  };
  filterQuarantinedCandidates: <T extends { path: ArbPathLike }>(candidates: T[], source: string) => T[];
  routeCacheUpdate: (candidates: ExecutableCandidate[]) => void;
  routeKeyFromEdges: (startToken: string, edges: any) => string;
  fmtPath: (path: ArbPathLike) => string;
  fmtProfit: (netWei: bigint, tokenAddr: string) => string;
  onPathsEvaluated: (count: number) => void;
  onCandidateMetrics: (metrics: { topCandidates: number; optimizedCandidates: number; profitableRoutes: number }) => void;
  onArbsFound: (count: number) => void;
  workerCount: number;
};

export function createArbSearcher(deps: SearchDeps) {
  async function evaluateCandidatesMultiProbe(paths: ArbPathLike[]) {
    const byStartToken = new Map<string, ArbPathLike[]>();
    for (const path of paths) {
      const token = path.startToken.toLowerCase();
      if (!byStartToken.has(token)) byStartToken.set(token, []);
      byStartToken.get(token)!.push(path);
    }

    const merged = new Map<string, CandidateEntry>();
    let totalProbeRuns = 0;
    let skippedProbeRuns = 0;

    for (const [startToken, tokenPaths] of byStartToken) {
      const probeAmounts = deps.getProbeAmountsForToken(startToken);
      let tokenHits = 0;

      for (let i = 0; i < probeAmounts.length; i++) {
        const probeAmount = probeAmounts[i];
        totalProbeRuns++;
        const batch = await deps.evaluatePathsParallel(
          tokenPaths,
          deps.stateCache,
          probeAmount,
          { workerCount: deps.workerCount },
        );
        mergeCandidateBatch(
          merged,
          normaliseCandidateBatch(batch as Array<{ path: ArbPathLike; result: Record<string, any> }>),
          deps.routeKeyFromEdges,
        );
        tokenHits += batch.length;

        if (tokenHits === 0 && i >= 1) {
          skippedProbeRuns += probeAmounts.length - (i + 1);
          break;
        }
      }
    }

    deps.log("[runner] Multi-probe evaluation complete", "debug", {
      event: "multi_probe_summary",
      startTokens: byStartToken.size,
      totalProbeRuns,
      skippedProbeRuns,
      mergedCandidates: merged.size,
    });

    return [...merged.values()].sort((a, b) => {
      if (b.result.profit > a.result.profit) return 1;
      if (b.result.profit < a.result.profit) return -1;
      return 0;
    });
  }

  return async function findArbs(): Promise<ExecutableCandidate[]> {
    if (deps.topologyDirty() || deps.cachedCycles().length === 0) await deps.refreshCycles();
    const cycles = deps.cachedCycles();
    if (cycles.length === 0) return [];

    const candidates = await evaluateCandidatesMultiProbe(cycles);
    deps.onPathsEvaluated(cycles.length);

    deps.log(
      candidates.length === 0
        ? `Scanned ${cycles.length} paths — no candidates above fee threshold`
        : `Scanned ${cycles.length} paths → ${candidates.length} candidates`,
      "info",
      { event: "scan_summary", paths: cycles.length, candidates: candidates.length },
    );

    if (candidates.length === 0) return [];

    const feeSnapshot = await deps.getCurrentFeeSnapshot();
    if (!feeSnapshot?.maxFee) {
      deps.log("Skipping arb search because the fee snapshot is stale or unavailable", "warn", {
        event: "scan_skip_stale_gas",
      });
      return [];
    }
    const gasPriceWei = feeSnapshot.maxFee;

    const {
      shortlisted: topCandidates,
      optimizedCandidates,
      profitable,
    } = await deps.evaluateCandidatePipeline(candidates, {
      shortlistLimit: deps.maxPathsToOptimize,
      gasPriceWei,
      getTokenToMaticRate: deps.getFreshTokenToMaticRate,
      optimizePath: (path: ArbPathLike, quickResult: RouteResultLike | null | undefined, tokenToMaticRate: bigint) =>
        deps.optimizeInputAmount(
          path,
          deps.stateCache,
          getAssessmentOptimizationOptions(path, quickResult, gasPriceWei, tokenToMaticRate, {
            minProfitWei: deps.minProfitWei,
          }),
        ) as RouteResultLike | null,
      assessRoute: (path: ArbPathLike, routeResult: RouteResultLike, tokenToMaticRate: bigint) =>
        assessRouteResult(path, routeResult, gasPriceWei, tokenToMaticRate, {
          minProfitWei: deps.minProfitWei,
        }),
    });

    const { fresh: freshProfitable, stale: staleProfitable } = deps.partitionFreshCandidates(
      profitable,
      (candidatePath: ArbPathLike) => deps.getRouteFreshness(candidatePath),
    );
    if (staleProfitable.length > 0) {
      deps.log("[runner] Skipping stale profitable routes from scan", "debug", {
        event: "find_arbs_skip_stale",
        staleRoutes: staleProfitable.length,
        reasons: [...new Set(staleProfitable.map(({ freshness }) => freshness.reason).filter(Boolean))].slice(0, 3),
      });
    }

    const eligibleProfitable = deps.filterQuarantinedCandidates(freshProfitable, "find_arbs");
    deps.onCandidateMetrics({
      topCandidates: topCandidates.length,
      optimizedCandidates,
      profitableRoutes: eligibleProfitable.length,
    });

    if (eligibleProfitable.length > 0) {
      deps.onArbsFound(eligibleProfitable.length);
      deps.routeCacheUpdate(eligibleProfitable);
      for (const { path, assessment } of eligibleProfitable) {
        const net = assessment.netProfitAfterGas ?? assessment.netProfit ?? 0n;
        deps.log(
          `  ↳ ${deps.fmtPath(path)}  net ${deps.fmtProfit(net, path.startToken)}`,
          "info",
          {
            event: "profitable_route",
            route: deps.fmtPath(path),
            hopCount: path.hopCount,
            netProfit: net.toString(),
          },
        );
      }
    }

    deps.log("[runner] Candidate optimization pass complete", "debug", {
      event: "candidate_optimization_summary",
      candidates: candidates.length,
      topCandidates: topCandidates.length,
      optimizedCandidates,
      skippedOptimization: topCandidates.length - optimizedCandidates,
      profitableRoutes: eligibleProfitable.length,
    });

    eligibleProfitable.sort(compareAssessmentProfit);
    return eligibleProfitable;
  };
}
