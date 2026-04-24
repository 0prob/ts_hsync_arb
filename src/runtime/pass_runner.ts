type LogLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace";
type LoggerFn = (msg: string, level?: LogLevel, meta?: unknown) => void;

type ArbPathLike = {
  startToken: string;
  edges: Array<{ protocol: string }>;
};

type CandidateLike = {
  path: ArbPathLike;
  result: { profit: bigint };
  assessment?: { roi?: number } | null;
};

type PassRunnerDeps = {
  getStateCacheSize: () => number;
  getCachedCycleCount: () => number;
  incrementPassCount: () => number;
  getConsecutiveErrors: () => number;
  incrementConsecutiveErrors: () => number;
  resetConsecutiveErrors: () => void;
  setBotState: (update: {
    passCount: number;
    consecutiveErrors: number;
    opportunities: Array<{ Route: string; Profit: string; ROI: string }>;
  }) => void;
  log: LoggerFn;
  trackBackgroundTask: (task: Promise<unknown>) => void;
  maybeRunDiscovery: () => Promise<unknown>;
  reconcileDiscoveryResult: (result: unknown) => Promise<unknown>;
  refreshCycles: () => Promise<unknown>;
  maybeHydrateQuietPools: () => Promise<unknown>;
  refreshPriceOracleIfStale: () => void;
  searchOpportunities: () => Promise<CandidateLike[]>;
  executeBatchIfIdle: (candidates: CandidateLike[], reason: string) => Promise<unknown>;
  formatProfit: (profit: bigint, startToken: string) => string;
  roiForCandidate: (candidate: CandidateLike) => number;
  formatDuration: (ms: number) => string;
  sleep: (ms: number) => Promise<unknown>;
  maxConsecutiveErrors: number;
  maxExecutionBatch: number;
};

function formatDisplayedOpportunities(
  candidates: CandidateLike[],
  deps: Pick<PassRunnerDeps, "formatProfit" | "roiForCandidate">,
) {
  return candidates.slice(0, 5).map((candidate) => ({
    Route: candidate.path.edges.map((edge) => edge.protocol).join(" -> "),
    Profit: deps.formatProfit(candidate.result.profit, candidate.path.startToken),
    ROI: `${(deps.roiForCandidate(candidate) / 10000).toFixed(2)}%`,
  }));
}

export function createPassRunner(deps: PassRunnerDeps) {
  async function runPass() {
    const startedAt = Date.now();
    const passCount = deps.incrementPassCount();
    const cachedCycleCount = deps.getCachedCycleCount();
    deps.log(`Pass #${passCount} — state: ${deps.getStateCacheSize()} pools, paths: ${cachedCycleCount}`, "info", {
      event: "pass_start",
      pass: passCount,
      stateSize: deps.getStateCacheSize(),
      cachedPaths: cachedCycleCount,
    });

    try {
      deps.trackBackgroundTask((async () => {
        const result = await deps.maybeRunDiscovery();
        await deps.reconcileDiscoveryResult(result);
      })().catch((err: any) => {
        deps.log(`Background discovery error: ${err?.message ?? err}`, "warn", {
          event: "discovery_bg_error",
          err,
        });
      }));

      await deps.refreshCycles();
      deps.trackBackgroundTask(deps.maybeHydrateQuietPools().catch((err: any) => {
        deps.log(`Quiet-pool sweep error: ${err?.message ?? err}`, "warn", {
          event: "quiet_pool_sweep_error",
          err,
        });
      }));

      deps.refreshPriceOracleIfStale();

      const opportunities = await deps.searchOpportunities();
      deps.setBotState({
        passCount,
        consecutiveErrors: deps.getConsecutiveErrors(),
        opportunities: formatDisplayedOpportunities(opportunities, deps),
      });

      deps.log(`Pass #${passCount}: ${opportunities.length} profitable route(s)`, "info", {
        event: "pass_opportunities",
        pass: passCount,
        opportunities: opportunities.length,
        stateSize: deps.getStateCacheSize(),
        cachedPaths: deps.getCachedCycleCount(),
        lastPass: deps.formatDuration(Date.now() - startedAt),
      });

      if (opportunities.length > 0) {
        deps.log("Executing top opportunity set...", "info", {
          event: "pass_execute_best",
          pass: passCount,
          opportunities: Math.min(opportunities.length, deps.maxExecutionBatch),
        });
        await deps.executeBatchIfIdle(opportunities.slice(0, deps.maxExecutionBatch), "run_pass");
      }

      deps.log(`Pass #${passCount} complete in ${deps.formatDuration(Date.now() - startedAt)}`, "info", {
        event: "pass_complete",
        pass: passCount,
        durationMs: Date.now() - startedAt,
        opportunities: opportunities.length,
      });
      deps.resetConsecutiveErrors();
    } catch (err: any) {
      deps.log(`Pass #${passCount} failed: ${err.message}`, "error", {
        event: "pass_failed",
        pass: passCount,
        consecutiveErrors: deps.getConsecutiveErrors() + 1,
        err,
      });
      const consecutiveErrors = deps.incrementConsecutiveErrors();
      if (consecutiveErrors >= deps.maxConsecutiveErrors) {
        deps.log(`${deps.maxConsecutiveErrors} consecutive errors — backing off 30s`, "warn");
        await deps.sleep(30_000);
        deps.resetConsecutiveErrors();
      }
    }
  }

  return { runPass };
}
