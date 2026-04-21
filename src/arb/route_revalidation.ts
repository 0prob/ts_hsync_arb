import {
  assessRouteResult,
  compareAssessmentProfit,
  getAssessmentOptimizationOptions,
  type ArbPathLike,
  type ExecutableCandidate,
  type RouteResultLike,
} from "./assessment.ts";

type RevalidationDeps = {
  getAffectedRoutes: (changedPools: Set<string>) => Array<{ path: ArbPathLike; result: RouteResultLike }>;
  stateCache: Map<string, Record<string, any>>;
  testAmountWei: bigint;
  minProfitWei: bigint;
  maxExecutionBatch: number;
  log: (msg: string, level?: "fatal" | "error" | "warn" | "info" | "debug" | "trace", meta?: any) => void;
  getCurrentFeeSnapshot: () => Promise<any>;
  getFreshTokenToMaticRate: (tokenAddress: string) => bigint;
  getRouteFreshness: (path: ArbPathLike) => { ok: boolean; reason?: string };
  simulateRoute: (path: ArbPathLike, amountIn: bigint, stateCache: Map<string, Record<string, any>>) => RouteResultLike;
  optimizeInputAmount: (path: ArbPathLike, stateCache: Map<string, Record<string, any>>, options: any) => RouteResultLike | null;
  filterQuarantinedCandidates: <T extends { path: ArbPathLike }>(candidates: T[], source: string) => T[];
  executeBatchIfIdle: (candidates: ExecutableCandidate[], source?: string) => Promise<any>;
};

export function createRouteRevalidator(deps: RevalidationDeps) {
  return async function revalidateCachedRoutes(changedPools: Set<string>) {
    const affected = deps.getAffectedRoutes(changedPools);
    if (affected.length === 0) return;

    deps.log(`[fast-revalidate] ${affected.length} cached route(s) for ${changedPools.size} changed pool(s)`, "debug", {
      event: "fast_revalidate_start",
      affectedRoutes: affected.length,
      changedPools: changedPools.size,
    });

    const feeSnapshot = await deps.getCurrentFeeSnapshot();
    if (!feeSnapshot?.maxFee) {
      deps.log("[fast-revalidate] Skipping because the fee snapshot is stale or unavailable", "warn", {
        event: "fast_revalidate_skip_stale_gas",
        affectedRoutes: affected.length,
      });
      return;
    }
    const gasPriceWei = feeSnapshot.maxFee;

    const profitable: ExecutableCandidate[] = [];
    let quickRejected = 0;
    let optimizedRoutes = 0;
    for (const { path, result: prev } of affected) {
      const tokenToMaticRate = deps.getFreshTokenToMaticRate(path.startToken);
      if (tokenToMaticRate <= 0n) continue;

      const quickResult = deps.simulateRoute(
        path,
        prev?.amountIn ?? deps.testAmountWei,
        deps.stateCache,
      ) as RouteResultLike;
      const quickAssessment = assessRouteResult(
        path,
        quickResult,
        gasPriceWei,
        tokenToMaticRate,
        { minProfitWei: deps.minProfitWei },
      );
      if (!quickAssessment.shouldExecute) {
        quickRejected++;
        continue;
      }

      const freshness = deps.getRouteFreshness(path);
      if (!freshness.ok) {
        deps.log(`[fast-revalidate] Skipping stale route: ${freshness.reason}`, "debug", {
          event: "fast_revalidate_skip_stale",
          reason: freshness.reason,
          hopCount: path.hopCount,
        });
        continue;
      }

      optimizedRoutes++;
      const optimized = deps.optimizeInputAmount(
        path,
        deps.stateCache,
        getAssessmentOptimizationOptions(path, prev, gasPriceWei, tokenToMaticRate, {
          minProfitWei: deps.minProfitWei,
        }),
      ) || quickResult;
      if (!optimized?.profitable) continue;

      const assessment = assessRouteResult(
        path,
        optimized,
        gasPriceWei,
        tokenToMaticRate,
        { minProfitWei: deps.minProfitWei },
      );
      if (assessment.shouldExecute) profitable.push({ path, result: optimized, assessment });
    }

    deps.log("[runner] Fast revalidation summary", "debug", {
      event: "fast_revalidate_summary",
      affectedRoutes: affected.length,
      quickRejected,
      optimizedRoutes,
      profitableRoutes: profitable.length,
    });

    const eligibleProfitable = deps.filterQuarantinedCandidates(profitable, "fast_revalidate");

    if (eligibleProfitable.length > 0) {
      eligibleProfitable.sort(compareAssessmentProfit);
      const executionBatch = eligibleProfitable.slice(0, deps.maxExecutionBatch);
      deps.log(`[fast-revalidate] ${eligibleProfitable.length} opportunity(ies) — executing ${executionBatch.length}`, "info", {
        event: "fast_revalidate_execute",
        profitableRoutes: eligibleProfitable.length,
        executingRoutes: executionBatch.length,
      });
      await deps.executeBatchIfIdle(executionBatch, "fast_revalidate");
    }
  };
}
