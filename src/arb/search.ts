import {
  assessRouteResult,
  compareAssessmentProfit,
  getAssessmentOptimizationOptions,
  type AssessmentLike,
  type ArbPathLike,
  type CandidateEntry,
  type ExecutableCandidate,
  type RouteResultLike,
} from "./assessment.ts";
import { getResultHopCount } from "../routing/path_hops.ts";

type LogLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace";
type LoggerFn = (msg: string, level?: LogLevel, meta?: unknown) => void;
type FeeSnapshot = {
  maxFee?: bigint;
  effectiveGasPriceWei?: bigint;
  updatedAt?: number;
} | null;
type RawRouteResult = Record<string, bigint | string | boolean | string[] | bigint[] | number | undefined>;
type CandidatePipelineResult = {
  shortlisted: CandidateEntry[];
  optimizedCandidates: number;
  profitable: ExecutableCandidate[];
  assessmentSummary?: {
    shortlisted: number;
    assessed: number;
    missingTokenRates: number;
    optimizedCandidates: number;
    secondChanceOptimized: number;
    profitable: number;
    rejected: number;
    rejectReasons: Record<string, number>;
  };
};
type ScanPathSelection = {
  paths: ArbPathLike[];
  duplicatePaths: number;
  stalePaths: number;
  staleReasons: string[];
};

function toBigIntInput(value: RawRouteResult[string]) {
  return typeof value === "string" || typeof value === "number" || typeof value === "bigint" || typeof value === "boolean"
    ? value
    : 0;
}

function normalizeRouteAmount(value: RawRouteResult[string], fallback = 0n) {
  if (typeof value === "bigint") return value;
  if (typeof value === "boolean") return value ? 1n : 0n;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || !Number.isInteger(value)) return fallback;
    try {
      return BigInt(value);
    } catch {
      return fallback;
    }
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return fallback;
    if (!/^-?\d+$/.test(trimmed)) return fallback;
    try {
      return BigInt(trimmed);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function isMissingRouteAmount(value: RawRouteResult[string]) {
  return value == null || (typeof value === "string" && value.trim().length === 0);
}

function normalizeRouteGas(value: RawRouteResult[string]) {
  const numeric = Number(value ?? 0);
  return Number.isSafeInteger(numeric) && numeric >= 0 ? numeric : -1;
}

function normalizeExplicitHopCount(value: RawRouteResult[string]) {
  if (value == null) return undefined;
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : 0;
}

function normalizeProbeAmounts(values: bigint[]) {
  return [...new Set(values.filter((amount) => typeof amount === "bigint" && amount > 0n).map(String))]
    .map((amount) => BigInt(amount));
}

function selectFreshUniqueScanPaths(
  paths: ArbPathLike[],
  deps: Pick<SearchDeps, "routeKeyFromEdges" | "getRouteFreshness">,
): ScanPathSelection {
  const uniqueByRoute = new Map<string, ArbPathLike>();
  let duplicatePaths = 0;

  for (const path of paths) {
    const key = deps.routeKeyFromEdges(path.startToken, path.edges);
    if (uniqueByRoute.has(key)) {
      duplicatePaths++;
      continue;
    }
    uniqueByRoute.set(key, path);
  }

  const staleReasons = new Map<string, number>();
  const freshPaths: ArbPathLike[] = [];
  let stalePaths = 0;
  for (const path of uniqueByRoute.values()) {
    const freshness = deps.getRouteFreshness(path);
    if (freshness.ok) {
      freshPaths.push(path);
      continue;
    }
    stalePaths++;
    const reason = freshness.reason ?? "unknown";
    staleReasons.set(reason, (staleReasons.get(reason) ?? 0) + 1);
  }

  return {
    paths: freshPaths,
    duplicatePaths,
    stalePaths,
    staleReasons: [...staleReasons.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([reason, count]) => `${reason}:${count}`)
      .slice(0, 5),
  };
}

export function toRouteResultLike(result: RawRouteResult): RouteResultLike {
  const amountIn = normalizeRouteAmount(toBigIntInput(result.amountIn));
  const amountOut = normalizeRouteAmount(toBigIntInput(result.amountOut));
  const profit = isMissingRouteAmount(result.profit) ? amountOut - amountIn : normalizeRouteAmount(toBigIntInput(result.profit));
  const profitable = typeof result.profitable === "boolean" ? result.profitable : profit > 0n;
  const poolPath = Array.isArray(result.poolPath) && result.poolPath.every((item) => typeof item === "string")
    ? result.poolPath
    : undefined;
  const tokenPath = Array.isArray(result.tokenPath) && result.tokenPath.every((item) => typeof item === "string")
    ? result.tokenPath
    : undefined;
  const hopAmounts = Array.isArray(result.hopAmounts)
    ? result.hopAmounts.map((amount) => normalizeRouteAmount(amount))
    : undefined;
  const routeResult = {
    amountIn,
    amountOut,
    profit,
    profitable,
    totalGas: normalizeRouteGas(result.totalGas),
    poolPath,
    tokenPath,
    hopAmounts,
    hopCount: normalizeExplicitHopCount(result.hopCount),
  };
  const derivedHopCount = getResultHopCount(routeResult);
  return {
    ...routeResult,
    hopCount: derivedHopCount ?? routeResult.hopCount,
  };
}

function mergeCandidateBatch(
  into: Map<string, CandidateEntry>,
  batch: CandidateEntry[],
  routeKeyFromEdges: (startToken: string, edges: ArbPathLike["edges"]) => string,
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
  batch: Array<{ path: ArbPathLike; result: RawRouteResult }>,
): CandidateEntry[] {
  return batch.map(({ path, result }) => ({
    path,
    result: toRouteResultLike(result),
  }));
}

type SearchDeps = {
  cachedCycles: () => ArbPathLike[];
  topologyDirty: () => boolean;
  refreshCycles: () => Promise<ArbPathLike[] | void>;
  passCount: () => number;
  maxPathsToOptimize: number;
  minProfitWei: bigint;
  stateCache: Map<string, Record<string, any>>;
  log: LoggerFn;
  getCurrentFeeSnapshot: () => Promise<FeeSnapshot>;
  getFreshTokenToMaticRate: (tokenAddress: string) => bigint;
  getRouteFreshness: (path: ArbPathLike) => { ok: boolean; reason?: string };
  getProbeAmountsForToken: (tokenAddress: string) => bigint[];
  evaluatePathsParallel: (
    paths: ArbPathLike[],
    stateCache: Map<string, Record<string, any>>,
    probeAmount: bigint,
    options: Record<string, unknown>,
  ) => Promise<Array<{ path: ArbPathLike; result: RawRouteResult }>>;
  optimizeInputAmount: (
    path: ArbPathLike,
    stateCache: Map<string, Record<string, any>>,
    options: Record<string, unknown>,
  ) => RouteResultLike | null;
  evaluateCandidatePipeline: (candidates: CandidateEntry[], options: {
    shortlistLimit: number;
    gasPriceWei: bigint;
    getTokenToMaticRate: (tokenAddress: string) => bigint;
    optimizePath: (
      path: ArbPathLike,
      quickResult: RouteResultLike | null | undefined,
      tokenToMaticRate: bigint,
    ) => Promise<RouteResultLike | null> | RouteResultLike | null;
    assessRoute: (path: ArbPathLike, routeResult: RouteResultLike, tokenToMaticRate: bigint) => AssessmentLike;
  }) => Promise<CandidatePipelineResult>;
  partitionFreshCandidates: (candidates: ExecutableCandidate[], getFreshness: (path: ArbPathLike) => { ok: boolean; reason?: string }) => {
    fresh: ExecutableCandidate[];
    stale: Array<{ candidate: ExecutableCandidate; freshness: { reason?: string } }>;
  };
  filterQuarantinedCandidates: <T extends { path: ArbPathLike }>(candidates: T[], source: string) => T[];
  routeCacheUpdate: (candidates: ExecutableCandidate[]) => void;
  routeKeyFromEdges: (startToken: string, edges: ArbPathLike["edges"]) => string;
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
    let totalPathEvaluations = 0;

    for (const [startToken, tokenPaths] of byStartToken) {
      const probeAmounts = normalizeProbeAmounts(deps.getProbeAmountsForToken(startToken));

      for (let i = 0; i < probeAmounts.length; i++) {
        const probeAmount = probeAmounts[i];
        totalProbeRuns++;
        totalPathEvaluations += tokenPaths.length;
        const batch = await deps.evaluatePathsParallel(
          tokenPaths,
          deps.stateCache,
          probeAmount,
          { workerCount: deps.workerCount },
        );
        mergeCandidateBatch(
          merged,
          normaliseCandidateBatch(batch),
          deps.routeKeyFromEdges,
        );
      }
    }

    deps.log("[runner] Multi-probe evaluation complete", "debug", {
      event: "multi_probe_summary",
      startTokens: byStartToken.size,
      totalProbeRuns,
      totalPathEvaluations,
      mergedCandidates: merged.size,
    });

    return {
      candidates: [...merged.values()].sort((a, b) => {
        if (b.result.profit > a.result.profit) return 1;
        if (b.result.profit < a.result.profit) return -1;
        return 0;
      }),
      totalProbeRuns,
      totalPathEvaluations,
    };
  }

  return async function findArbs(): Promise<ExecutableCandidate[]> {
    if (deps.topologyDirty() || deps.cachedCycles().length === 0) await deps.refreshCycles();
    const cycles = deps.cachedCycles();
    if (cycles.length === 0) return [];

    const scanSelection = selectFreshUniqueScanPaths(cycles, deps);
    if (scanSelection.duplicatePaths > 0 || scanSelection.stalePaths > 0) {
      deps.log("[runner] Pruned routes before simulation", "debug", {
        event: "scan_prune_routes",
        cachedPaths: cycles.length,
        duplicatePaths: scanSelection.duplicatePaths,
        stalePaths: scanSelection.stalePaths,
        scanPaths: scanSelection.paths.length,
        staleReasons: scanSelection.staleReasons,
      });
    }

    if (scanSelection.paths.length === 0) {
      deps.onPathsEvaluated(0);
      deps.log("Skipped arb scan because no cached routes have fresh state", "info", {
        event: "scan_skip_no_fresh_routes",
        cachedPaths: cycles.length,
        duplicatePaths: scanSelection.duplicatePaths,
        stalePaths: scanSelection.stalePaths,
        staleReasons: scanSelection.staleReasons,
      });
      return [];
    }

    const { candidates, totalProbeRuns, totalPathEvaluations } = await evaluateCandidatesMultiProbe(scanSelection.paths);
    deps.onPathsEvaluated(totalPathEvaluations);

    deps.log(
      candidates.length === 0
        ? `Scanned ${scanSelection.paths.length} paths — no candidates above fee threshold`
        : `Scanned ${scanSelection.paths.length} paths → ${candidates.length} candidates`,
      "info",
      {
        event: "scan_summary",
        paths: scanSelection.paths.length,
        cachedPaths: cycles.length,
        duplicatePaths: scanSelection.duplicatePaths,
        stalePaths: scanSelection.stalePaths,
        totalProbeRuns,
        totalPathEvaluations,
        candidates: candidates.length,
      },
    );

    if (candidates.length === 0) return [];

    const feeSnapshot = await deps.getCurrentFeeSnapshot();
    if (!feeSnapshot?.maxFee) {
      deps.log("Skipping arb search because the fee snapshot is stale or unavailable", "warn", {
        event: "scan_skip_stale_gas",
      });
      return [];
    }
    const gasPriceWei = feeSnapshot.effectiveGasPriceWei ?? feeSnapshot.maxFee;

    const {
      shortlisted: topCandidates,
      optimizedCandidates,
      profitable,
      assessmentSummary,
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
      assessmentSummary,
    });

    eligibleProfitable.sort(compareAssessmentProfit);
    return eligibleProfitable;
  };
}
