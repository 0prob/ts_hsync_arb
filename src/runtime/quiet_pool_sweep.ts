import { takeTopNBy } from "../util/bounded_priority.ts";
import { getPoolTokens } from "../util/pool_record.ts";
import { isObservedUnroutableWarmupState } from "../bootstrap/warmup.ts";

type LogLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace";
type LoggerFn = (msg: string, level?: LogLevel, meta?: unknown) => void;

type PoolRecord = {
  pool_address: string;
  protocol: string;
  tokens: unknown;
  metadata?: unknown;
  status?: string;
  state?: { data?: Record<string, unknown> };
};

type PoolState = Record<string, unknown>;
type StateCache = Map<string, PoolState>;

type QuietPoolSweepDeps = {
  getRegistryPools: () => PoolRecord[];
  stateCache: StateCache;
  log: LoggerFn;
  isHydratablePool: (pool: PoolRecord) => boolean;
  validatePoolState: (state: PoolState | undefined) => { valid: boolean; reason?: string };
  fetchAndCacheStates: (pools: PoolRecord[], options: Record<string, unknown>) => Promise<unknown>;
  admitPools: (poolAddresses: Set<string>) => number;
  refreshCycles: (force?: boolean) => Promise<unknown>;
  quietPoolSweepBatchSize: number;
  quietPoolSweepIntervalMs: number;
  quietPoolRetryBaseMs: number;
  quietPoolRetryMaxMs: number;
  v3NearWordRadius: number;
  polygonHubTokens: Set<string>;
};

function compareDeferredHydrationPriority(a: PoolRecord, b: PoolRecord, polygonHubTokens: Set<string>) {
  const aTokens = getPoolTokens(a);
  const bTokens = getPoolTokens(b);
  const aHubMatches = aTokens.filter((token) => polygonHubTokens.has(token)).length;
  const bHubMatches = bTokens.filter((token) => polygonHubTokens.has(token)).length;
  if (aHubMatches !== bHubMatches) return bHubMatches - aHubMatches;

  const aIsV3 = /V3|ELASTIC/.test(a.protocol);
  const bIsV3 = /V3|ELASTIC/.test(b.protocol);
  if (aIsV3 !== bIsV3) return aIsV3 ? 1 : -1;

  return a.pool_address.localeCompare(b.pool_address);
}

export function createQuietPoolSweepCoordinator(deps: QuietPoolSweepDeps) {
  let lastQuietPoolSweepAt = 0;
  let quietSweepRunning = false;
  const deferredHydrationInFlight = new Set<string>();
  const deferredHydrationRetryState = new Map<string, { attempts: number; nextRetryAt: number; lastReason: string }>();

  function nextDeferredHydrationRetryMs(attempts: number) {
    const exponent = Math.max(0, attempts - 1);
    return Math.min(deps.quietPoolRetryMaxMs, deps.quietPoolRetryBaseMs * (2 ** exponent));
  }

  function clearDeferredHydrationRetry(addr: string) {
    deferredHydrationRetryState.delete(addr);
  }

  function recordDeferredHydrationFailure(addr: string, reason: string) {
    const current = deferredHydrationRetryState.get(addr);
    const attempts = (current?.attempts ?? 0) + 1;
    deferredHydrationRetryState.set(addr, {
      attempts,
      nextRetryAt: Date.now() + nextDeferredHydrationRetryMs(attempts),
      lastReason: reason,
    });
  }

  function beginDeferredHydration(pools: PoolRecord[]) {
    const accepted: PoolRecord[] = [];
    for (const pool of pools) {
      const addr = pool.pool_address.toLowerCase();
      if (deferredHydrationInFlight.has(addr)) continue;
      deferredHydrationInFlight.add(addr);
      accepted.push(pool);
    }
    return accepted;
  }

  function finishDeferredHydration(pools: PoolRecord[]) {
    for (const pool of pools) {
      deferredHydrationInFlight.delete(pool.pool_address.toLowerCase());
    }
  }

  function selectPendingQuietPools(activePools: PoolRecord[]) {
    const now = Date.now();
    const pending: PoolRecord[] = [];
    let unsupportedPools = 0;
    let coolingDownPools = 0;
    let inFlightPools = 0;
    let observedUnroutablePools = 0;
    for (const pool of activePools) {
      const addr = pool.pool_address.toLowerCase();
      const state = deps.stateCache.get(addr);
      const verdict = deps.validatePoolState(state);
      if (verdict.valid) continue;
      if (isObservedUnroutableWarmupState(state, verdict)) {
        observedUnroutablePools++;
        continue;
      }
      if (!deps.isHydratablePool(pool)) {
        unsupportedPools++;
        continue;
      }
      if (deferredHydrationInFlight.has(addr)) {
        inFlightPools++;
        continue;
      }
      const retryState = deferredHydrationRetryState.get(addr);
      if (retryState && retryState.nextRetryAt > now) {
        coolingDownPools++;
        continue;
      }
      pending.push(pool);
    }
    return {
      pending: takeTopNBy(
        pending,
        deps.quietPoolSweepBatchSize,
        (a, b) => compareDeferredHydrationPriority(a, b, deps.polygonHubTokens),
      ),
      skippedUnsupportedPools: unsupportedPools,
      skippedCoolingDownPools: coolingDownPools,
      skippedInFlightPools: inFlightPools,
      skippedObservedUnroutablePools: observedUnroutablePools,
    };
  }

  async function maybeHydrateQuietPools() {
    const now = Date.now();
    if (now - lastQuietPoolSweepAt < deps.quietPoolSweepIntervalMs) return;
    if (quietSweepRunning) return;
    lastQuietPoolSweepAt = now;
    quietSweepRunning = true;
    let claimedPools: PoolRecord[] = [];

    try {
      const activePools = deps.getRegistryPools();
      const selection = selectPendingQuietPools(activePools);
      const pending = beginDeferredHydration(selection.pending);
      claimedPools = pending;

      if (pending.length === 0) {
        if (
          selection.skippedUnsupportedPools > 0 ||
          selection.skippedCoolingDownPools > 0 ||
          selection.skippedInFlightPools > 0 ||
          selection.skippedObservedUnroutablePools > 0
        ) {
          deps.log("[runner] Quiet-pool sweep skipped all currently invalid pools.", "debug", {
            event: "quiet_pool_sweep_skipped",
            unsupportedPools: selection.skippedUnsupportedPools,
            coolingDownPools: selection.skippedCoolingDownPools,
            inFlightPools: selection.skippedInFlightPools,
            observedUnroutablePools: selection.skippedObservedUnroutablePools,
          });
        }
        return;
      }

      deps.log(`[runner] Quiet-pool sweep: hydrating ${pending.length} deferred pool(s).`, "info", {
        event: "quiet_pool_sweep_start",
        pendingPools: pending.length,
        batchSize: deps.quietPoolSweepBatchSize,
        unsupportedPools: selection.skippedUnsupportedPools,
        coolingDownPools: selection.skippedCoolingDownPools,
        inFlightPools: selection.skippedInFlightPools,
        observedUnroutablePools: selection.skippedObservedUnroutablePools,
      });

      const warmupStats = await deps.fetchAndCacheStates(pending, {
        v3HydrationMode: "nearby",
        v3NearWordRadius: deps.v3NearWordRadius,
        logContext: {
          label: "Quiet-pool hydration",
          eventPrefix: "quiet_pool_sweep",
        },
      });

      const hydratedAddrs = new Set<string>();
      let failedPools = 0;
      let observedUnroutablePools = 0;
      const validationReasons: Record<string, number> = {};
      for (const pool of pending) {
        const addr = pool.pool_address.toLowerCase();
        const state = deps.stateCache.get(addr);
        const verdict = deps.validatePoolState(state);
        if (verdict.valid) {
          hydratedAddrs.add(addr);
          clearDeferredHydrationRetry(addr);
        } else if (isObservedUnroutableWarmupState(state, verdict)) {
          observedUnroutablePools++;
          clearDeferredHydrationRetry(addr);
          const reason = verdict.reason ?? "observed_unroutable";
          validationReasons[reason] = (validationReasons[reason] ?? 0) + 1;
        } else {
          failedPools++;
          const reason = verdict.reason ?? "state_not_routable_after_quiet_sweep";
          validationReasons[reason] = (validationReasons[reason] ?? 0) + 1;
          recordDeferredHydrationFailure(addr, reason);
        }
      }

      const admitted = deps.admitPools(hydratedAddrs);
      deps.log(
        `[runner] Quiet-pool sweep complete: ${hydratedAddrs.size}/${pending.length} routable, ${observedUnroutablePools} observed unroutable.`,
        "info",
        {
          event: "quiet_pool_sweep_complete",
          pendingPools: pending.length,
          routablePools: hydratedAddrs.size,
          observedUnroutablePools,
          failedPools,
          admittedPools: admitted,
          validationReasons,
          warmupStats,
        },
      );

      if (admitted > 0) {
        await deps.refreshCycles(true);
      }
    } finally {
      finishDeferredHydration(claimedPools);
      quietSweepRunning = false;
    }
  }

  return {
    claimDeferredHydration: beginDeferredHydration,
    releaseDeferredHydration: finishDeferredHydration,
    clearDeferredHydrationRetry,
    recordDeferredHydrationFailure,
    maybeHydrateQuietPools,
  };
}
