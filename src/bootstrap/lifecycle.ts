export function createArbScheduler(deps: {
  isRunning: () => boolean;
  recordArbActivity: (changedPools: number) => void;
  getAdaptiveDebounceMs: () => number;
  runPass: () => Promise<void>;
}) {
  let arbQueued = false;
  let lastArbMs = 0;
  let arbRunning = false;
  let arbDirty = false;
  let arbTimer: ReturnType<typeof setTimeout> | null = null;

  function scheduleArb(changedPools = 0) {
    if (!deps.isRunning()) return;
    deps.recordArbActivity(changedPools);
    if (arbQueued || arbRunning) {
      arbDirty = true;
      return;
    }

    const debounceMs = deps.getAdaptiveDebounceMs();
    const delay = Math.max(0, debounceMs - (Date.now() - lastArbMs));
    arbQueued = true;

    arbTimer = setTimeout(async () => {
      arbTimer = null;
      arbQueued = false;
      lastArbMs = Date.now();

      if (!deps.isRunning()) {
        arbDirty = false;
        return;
      }

      if (arbRunning) {
        arbDirty = true;
        return;
      }

      arbRunning = true;
      try {
        await deps.runPass();
      } finally {
        arbRunning = false;
        if (arbDirty && deps.isRunning()) {
          arbDirty = false;
          scheduleArb();
        }
      }
    }, delay);
  }

  function cancelScheduledArb() {
    if (arbTimer) {
      clearTimeout(arbTimer);
      arbTimer = null;
    }
    arbQueued = false;
    arbDirty = false;
  }

  return { scheduleArb, cancelScheduledArb };
}

export function createShutdownHandler(deps: {
  log: (msg: string, level?: "fatal" | "error" | "warn" | "info" | "debug" | "trace", meta?: any) => void;
  setRunning: (running: boolean) => void;
  stopTui: () => void;
  getWatcher: () => any;
  gasOracle: any;
  getRegistry: () => any;
  workerPool: { terminate: () => Promise<void> };
  stopMetricsServer: () => void;
  cancelScheduledArb?: () => void;
  exit: (code: number) => never;
}) {
  let shutdownPromise: Promise<void> | null = null;

  return async function shutdown() {
    if (shutdownPromise) return shutdownPromise;
    shutdownPromise = (async () => {
      deps.log("Shutdown signal received...");
      deps.setRunning(false);
      deps.cancelScheduledArb?.();
      deps.stopTui();
      const watcher = deps.getWatcher();
      if (watcher) await watcher.stop();
      if (deps.gasOracle) deps.gasOracle.stop();
      const registry = deps.getRegistry();
      if (registry) registry.close();
      await deps.workerPool.terminate();
      deps.stopMetricsServer();
      deps.exit(0);
    })();
    return shutdownPromise;
  };
}

export function configureWatcherCallbacks(deps: {
  watcher: any;
  log: (msg: string, level?: "fatal" | "error" | "warn" | "info" | "debug" | "trace", meta?: any) => void;
  partitionChangedPools: (changedPools: Set<string>) => { valid: Set<string>; invalid: Set<string> };
  removePoolsFromGraphs: (poolAddresses: Set<string>) => number;
  routeCache: { removeByPools: (poolAddresses: Set<string>) => number; clear: () => void };
  topologyCache: { invalidateSerializedTopologies: () => void };
  setTopologyDirty: (dirty: boolean) => void;
  admitPoolsToGraphs: (poolAddresses: Set<string>) => number;
  priceOracle: any;
  revalidateCachedRoutes: (changedPools: Set<string>) => Promise<void>;
  scheduleArb: (changedPools?: number) => void;
  setCachedCycles: (cycles: any[]) => void;
  resetGraphs: () => void;
}) {
  deps.watcher.onBatch = (changedAddrs: Set<string>) => {
    const { valid: validChangedAddrs, invalid: invalidChangedAddrs } =
      deps.partitionChangedPools(changedAddrs);
    if (validChangedAddrs.size === 0 && invalidChangedAddrs.size === 0) {
      deps.log("[runner] No usable pool changes in watcher batch", "debug", {
        event: "watcher_batch_skip",
        changedPools: changedAddrs.size,
      });
      return;
    }

    if (invalidChangedAddrs.size > 0) {
      const removedEdges = deps.removePoolsFromGraphs(invalidChangedAddrs);
      deps.log(
        `[runner] ${invalidChangedAddrs.size} pool(s) became unroutable; ${removedEdges / 2} removed from topology.`,
        "info",
        {
          event: "watcher_batch_remove_unroutable",
          changedPools: changedAddrs.size,
          invalidPools: invalidChangedAddrs.size,
          removedPools: removedEdges / 2,
        },
      );
      const removedRoutes = deps.routeCache.removeByPools(invalidChangedAddrs);
      deps.topologyCache.invalidateSerializedTopologies();
      deps.setTopologyDirty(true);
      deps.log("[runner] Marked topology dirty after unroutable pool removal", "debug", {
        event: "topology_dirty",
        reason: "unroutable_pool_removed",
        invalidPools: invalidChangedAddrs.size,
        removedRoutes,
      });
    }

    if (validChangedAddrs.size > 0) {
      deps.log(
        `[watcher] ${validChangedAddrs.size}/${changedAddrs.size} pool state(s) updated`,
        "info",
        {
          event: "watcher_batch_valid",
          changedPools: changedAddrs.size,
          validPools: validChangedAddrs.size,
        },
      );
      const admitted = deps.admitPoolsToGraphs(validChangedAddrs);
      if (admitted > 0) {
        deps.log(`[runner] Admitted ${admitted} newly routable pool(s); refreshing cycles soon.`, "info", {
          event: "watcher_batch_admit",
          changedPools: changedAddrs.size,
          validPools: validChangedAddrs.size,
          admittedPools: admitted,
        });
        deps.setTopologyDirty(true);
        deps.topologyCache.invalidateSerializedTopologies();
        deps.log("[runner] Marked topology dirty after admitting new pools", "debug", {
          event: "topology_dirty",
          reason: "new_pools_admitted",
          admittedPools: admitted,
        });
      }
      deps.priceOracle?.update(validChangedAddrs);
      deps.revalidateCachedRoutes(validChangedAddrs).catch((err: any) => {
        deps.log(`Route revalidation error: ${err?.message ?? err}`, "warn", {
          event: "revalidate_error",
          err,
        });
      });
    }

    deps.scheduleArb(validChangedAddrs.size + invalidChangedAddrs.size);
  };

  deps.watcher.onReorg = ({ reorgBlock, changedAddrs }: { reorgBlock: number; changedAddrs?: Iterable<string> | Array<string> }) => {
    const changedPoolCount = changedAddrs instanceof Set
      ? changedAddrs.size
      : Array.isArray(changedAddrs)
        ? changedAddrs.length
        : changedAddrs
          ? [...changedAddrs].length
          : 0;
    deps.log(
      `[runner] Reorg rollback to block ${reorgBlock}; clearing cached routes and topology`,
      "warn",
      {
        event: "watcher_reorg",
        reorgBlock,
        changedPools: changedPoolCount,
      },
    );
    deps.routeCache.clear();
    deps.setCachedCycles([]);
    deps.resetGraphs();
    deps.topologyCache.invalidateSerializedTopologies();
    deps.setTopologyDirty(true);
    deps.priceOracle?.update();
    if (changedPoolCount > 0) {
      deps.log(`[runner] Reorg cache reload touched ${changedPoolCount} active pool(s)`, "debug", {
        event: "watcher_reorg_reload",
        changedPools: changedPoolCount,
      });
    }
    deps.scheduleArb(changedPoolCount);
  };
}
