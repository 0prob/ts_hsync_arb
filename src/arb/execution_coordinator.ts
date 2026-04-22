import {
  assessRouteResult,
  compareAssessmentProfit,
  profitMarginBps,
  type ArbPathLike,
  type ExecutableCandidate,
} from "./assessment.ts";

type QuarantineEntry = {
  until: number;
  reason: string;
  failures: number;
  quarantinedAt: number;
};

type ExecutionCoordinatorDeps = {
  liveMode: boolean;
  privateKey: string | null;
  executorAddress: string | null;
  rpcUrl: string;
  getNonceManager: () => any;
  maxExecutionBatch: number;
  executionRouteQuarantineMs: number;
  minProfitWei: bigint;
  log: (msg: string, level?: "fatal" | "error" | "warn" | "info" | "debug" | "trace", meta?: any) => void;
  fmtPath: (path: ArbPathLike) => string;
  getRouteFreshness: (path: ArbPathLike) => { ok: boolean; reason?: string; ageMs?: number; skewMs?: number };
  getCurrentFeeSnapshot: () => Promise<any>;
  getFreshTokenToMaticRate: (tokenAddress: string) => bigint;
  deriveOnChainMinProfit: (assessment: any, tokenToMaticRate: bigint) => bigint;
  buildArbTx: (candidate: ExecutableCandidate, accounts: any, options: any) => Promise<any>;
  sendTx: (tx: any, clientConfig: any, options: any) => Promise<any>;
  sendTxBundle: (txs: any[], clientConfig: any, options: any) => Promise<any>;
  hasPendingExecution?: (fromAddress?: string | null | undefined) => boolean;
  scalePriorityFeeByProfitMargin: (fees: any, profitMarginBps: bigint) => any;
  onPreparedCandidateError?: (candidate: ExecutableCandidate, reason: string, quarantine: QuarantineEntry) => void;
};

export function createExecutionCoordinator(deps: ExecutionCoordinatorDeps) {
  let executionInFlight = false;
  const executionRouteQuarantine = new Map<string, QuarantineEntry>();

  async function mapExecutionCandidates<T, R>(
    candidates: T[],
    worker: (candidate: T) => Promise<R>,
  ): Promise<R[]> {
    if (candidates.length === 0) return [];

    const concurrency = Math.max(1, Math.min(deps.maxExecutionBatch, candidates.length));
    const results = new Array<R>(candidates.length);
    let nextIndex = 0;

    async function runWorker() {
      while (nextIndex < candidates.length) {
        const currentIndex = nextIndex++;
        results[currentIndex] = await worker(candidates[currentIndex]);
      }
    }

    await Promise.all(Array.from({ length: concurrency }, () => runWorker()));
    return results;
  }

  function executionRouteKey(path: ArbPathLike) {
    return `${path.startToken.toLowerCase()}::${path.edges.map((edge) => edge.poolAddress.toLowerCase()).join("::")}`;
  }

  function pruneExecutionRouteQuarantine(now = Date.now()) {
    for (const [key, entry] of executionRouteQuarantine.entries()) {
      if (entry.until <= now) executionRouteQuarantine.delete(key);
    }
  }

  function getExecutionRouteQuarantine(path: ArbPathLike, now = Date.now()) {
    const key = executionRouteKey(path);
    const entry = executionRouteQuarantine.get(key);
    if (!entry) return null;
    if (entry.until <= now) {
      executionRouteQuarantine.delete(key);
      return null;
    }
    return entry;
  }

  function quarantineExecutionRoute(path: ArbPathLike, reason: string, now = Date.now()) {
    const key = executionRouteKey(path);
    const previous = executionRouteQuarantine.get(key);
    const failures = (previous?.failures ?? 0) + 1;
    const until = now + deps.executionRouteQuarantineMs;
    executionRouteQuarantine.set(key, {
      until,
      reason,
      failures,
      quarantinedAt: now,
    });
    return { failures, until };
  }

  function clearExecutionRouteQuarantine(reason: string) {
    if (executionRouteQuarantine.size === 0) return;
    executionRouteQuarantine.clear();
    deps.log("[runner] Cleared execution route quarantine", "debug", {
      event: "execute_quarantine_clear",
      reason,
    });
  }

  function filterQuarantinedCandidates<T extends { path: ArbPathLike }>(candidates: T[], source: string) {
    const now = Date.now();
    pruneExecutionRouteQuarantine(now);
    let quarantined = 0;
    const filtered = candidates.filter((candidate) => {
      const entry = getExecutionRouteQuarantine(candidate.path, now);
      if (!entry) return true;
      quarantined++;
      return false;
    });
    if (quarantined > 0) {
      deps.log("[runner] Skipping quarantined execution routes", "debug", {
        event: "execute_quarantine_skip",
        source,
        candidates: candidates.length,
        quarantined,
        remaining: filtered.length,
      });
    }
    return filtered;
  }

  async function prepareExecutionCandidate(best: ExecutableCandidate, account: { address: string }) {
    const quarantineEntry = getExecutionRouteQuarantine(best.path);
    if (quarantineEntry) {
      deps.log("[runner] Skipping quarantined route during execution preparation", "debug", {
        event: "execute_skip",
        reason: "route_quarantined",
        route: deps.fmtPath(best.path),
        hopCount: best.path.hopCount,
        quarantineReason: quarantineEntry.reason,
        failures: quarantineEntry.failures,
        quarantineMs: Math.max(0, quarantineEntry.until - Date.now()),
      });
      return null;
    }

    const freshness = deps.getRouteFreshness(best.path);
    if (!freshness.ok) {
      const quarantineReason = freshness.reason ?? "route freshness check failed";
      const quarantine = quarantineExecutionRoute(best.path, quarantineReason);
      deps.log("[runner] Quarantining stale route during execution preparation", "warn", {
        event: "execute_quarantine_add",
        route: deps.fmtPath(best.path),
        hopCount: best.path.hopCount,
        failures: quarantine.failures,
        quarantineMs: Math.max(0, quarantine.until - Date.now()),
        reason: quarantineReason,
        ageMs: freshness.ageMs,
        skewMs: freshness.skewMs,
        source: "prepare_execution",
      });
      return null;
    }

    const feeSnapshot = await deps.getCurrentFeeSnapshot();
    const dynamicBid = feeSnapshot
      ? deps.scalePriorityFeeByProfitMargin(feeSnapshot, profitMarginBps(best))
      : null;

    const onChainMinProfit = deps.deriveOnChainMinProfit(
      best.assessment,
      deps.getFreshTokenToMaticRate(best.path.startToken),
    );

    const builtTx = await deps.buildArbTx(
      best,
      { executorAddress: deps.executorAddress, fromAddress: account.address },
      {
        minProfit: onChainMinProfit,
        slippageBps: 50,
        gasMultiplier: 1.25,
        maxFeeOverride: dynamicBid?.maxFeePerGas,
        priorityFeeOverride: dynamicBid?.maxPriorityFeePerGas,
      },
    );

    const tokenToMaticRate = deps.getFreshTokenToMaticRate(best.path.startToken);
    if (tokenToMaticRate <= 0n) {
      deps.log("[SKIP] Post-build price check failed: stale or missing token/MATIC rate", "warn", {
        event: "execute_skip",
        reason: "stale_or_missing_token_matic_rate",
      });
      return null;
    }

    const postBuildAssessment = assessRouteResult(
      best.path,
      { ...best.result, totalGas: Number(builtTx.gasLimit) },
      builtTx.maxFeePerGas,
      tokenToMaticRate,
      { minProfitWei: deps.minProfitWei },
    );

    if (!postBuildAssessment.shouldExecute) {
      deps.log(
        `[SKIP] Post-build profit check failed: ${postBuildAssessment.rejectReason}`,
        "info",
        () => ({
          event: "execute_skip",
          reason: "post_build_profit_check_failed",
          rejectReason: postBuildAssessment.rejectReason,
          hopCount: best.path.hopCount,
          preNetProfitAfterGas: best.assessment.netProfitAfterGas?.toString?.(),
          postNetProfitAfterGas: postBuildAssessment.netProfitAfterGas?.toString?.(),
        }),
      );
      return null;
    }

    deps.log(
      `[drift] pre=${best.assessment.netProfitAfterGas} post=${postBuildAssessment.netProfitAfterGas} onChainMin=${onChainMinProfit}`,
      "info",
      () => ({
        event: "execute_drift_check",
        hopCount: best.path.hopCount,
        preNetProfitAfterGas: best.assessment.netProfitAfterGas?.toString?.(),
        postNetProfitAfterGas: postBuildAssessment.netProfitAfterGas?.toString?.(),
        onChainMinProfit: onChainMinProfit.toString(),
      }),
    );

    return { best, builtTx };
  }

  async function executeMany(candidates: ExecutableCandidate[]) {
    if (!deps.liveMode) {
      const dryRunTargets = candidates.slice(0, deps.maxExecutionBatch);
      deps.log(`[DRY-RUN] Would execute ${dryRunTargets.length} opportunity(ies)`, "info", () => ({
        event: "execute_dry_run",
        opportunities: dryRunTargets.length,
        hopCounts: dryRunTargets.map((candidate) => candidate.path.hopCount),
        netProfits: dryRunTargets.map((candidate) => candidate.assessment.netProfit.toString()),
      }));
      return { submitted: false, dryRun: true };
    }

    if (!deps.privateKey || !deps.executorAddress) {
      deps.log("[SKIP] PRIVATE_KEY and EXECUTOR_ADDRESS required for --live", "warn", {
        event: "execute_skip",
        reason: "missing_live_config",
      });
      return { submitted: false, error: "missing config" };
    }

    try {
      const { privateKeyToAccount } = await import("viem/accounts");
      const account = privateKeyToAccount(deps.privateKey as `0x${string}`);
      const prepared = [];
      const executionCandidates = candidates.slice(0, deps.maxExecutionBatch);
      const preparedCandidates = await mapExecutionCandidates(executionCandidates, async (candidate) => {
        try {
          return await prepareExecutionCandidate(candidate, account);
        } catch (err: any) {
          const reason = err?.shortMessage ?? err?.message ?? "execution preparation failed";
          const quarantine = quarantineExecutionRoute(candidate.path, reason);
          deps.onPreparedCandidateError?.(candidate, reason, {
            reason,
            failures: quarantine.failures,
            until: quarantine.until,
            quarantinedAt: Date.now(),
          });
          return null;
        }
      });

      for (const preparedCandidate of preparedCandidates) {
        if (preparedCandidate) prepared.push(preparedCandidate);
      }

      if (prepared.length === 0) {
        return { submitted: false, error: "no execution candidates survived post-build checks" };
      }

      const clientConfig = {
        privateKey: deps.privateKey,
        rpcUrl: deps.rpcUrl,
        nonceManager: deps.getNonceManager(),
      };

      if (prepared.length === 1) {
        return await deps.sendTx(prepared[0].builtTx, clientConfig, { awaitReceipt: false });
      }

      deps.log(`[runner] Bundling ${prepared.length} opportunities into one private bundle`, "info", {
        event: "execute_bundle",
        opportunities: prepared.length,
        hopCounts: prepared.map((entry) => entry.best.path.hopCount),
      });

      return await deps.sendTxBundle(
        prepared.map((entry) => entry.builtTx),
        clientConfig,
        { awaitReceipt: false },
      );
    } catch (err: any) {
      deps.log(`Execution error: ${err.message}`, "error", {
        event: "execute_error",
        err,
      });
      return { submitted: false, error: err.message };
    }
  }

  async function executeBatchIfIdle(candidates: ExecutableCandidate[], source = "unknown") {
    if (executionInFlight || deps.hasPendingExecution?.()) {
      deps.log("[runner] Skipping execution while another transaction is in flight", "warn", {
        event: "execute_skip",
        reason: executionInFlight ? "execution_in_flight" : "pending_transaction_in_flight",
        source,
      });
      return {
        submitted: false,
        error: executionInFlight ? "execution already in flight" : "pending transaction already in flight",
      };
    }

    executionInFlight = true;
    try {
      return await executeMany(candidates);
    } finally {
      executionInFlight = false;
    }
  }

  async function executeIfIdle(best: ExecutableCandidate, source = "unknown") {
    return executeBatchIfIdle([best], source);
  }

  return {
    clearExecutionRouteQuarantine,
    executeBatchIfIdle,
    executeIfIdle,
    filterQuarantinedCandidates,
  };
}
