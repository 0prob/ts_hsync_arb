type LogLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace";
type LoggerFn = (msg: string, level?: LogLevel, meta?: unknown) => void;

type PoolState = Record<string, unknown>;
type StateCache = Map<string, PoolState>;

type WatcherBatchDeps = {
  stateCache: StateCache;
  log: LoggerFn;
  validatePoolState: (state: PoolState | undefined) => { valid: boolean; reason?: string };
  debugInvalidPool?: (address: string, reason?: string) => void;
  removePoolsFromTopology: (poolAddresses: Set<string>) => number;
  removeRoutesByPools: (poolAddresses: Set<string>) => number;
  admitPools: (poolAddresses: Set<string>) => number;
  updatePriceOracle: (changedPools?: Iterable<string>) => void;
  revalidateCachedRoutes: (changedPools: Set<string>) => Promise<unknown>;
};

export function createWatcherBatchCoordinator(deps: WatcherBatchDeps) {
  function partitionChangedPools(changedPools: Set<string>) {
    const valid = new Set<string>();
    const invalid = new Set<string>();

    for (const addr of changedPools) {
      const state = deps.stateCache.get(addr);
      const verdict = deps.validatePoolState(state);
      if (verdict.valid) {
        valid.add(addr);
      } else {
        invalid.add(addr);
        deps.debugInvalidPool?.(addr, verdict.reason);
      }
    }

    return { valid, invalid };
  }

  async function handlePoolsChanged(changedPools: Set<string>) {
    const { valid: validChangedAddrs, invalid: invalidChangedAddrs } = partitionChangedPools(changedPools);

    if (validChangedAddrs.size === 0 && invalidChangedAddrs.size === 0) {
      deps.log("[runner] No usable pool changes in watcher batch", "debug", {
        event: "watcher_batch_skip",
        changedPools: changedPools.size,
      });
      return;
    }

    if (invalidChangedAddrs.size > 0) {
      const removedEdges = deps.removePoolsFromTopology(invalidChangedAddrs);
      const removedRoutes = deps.removeRoutesByPools(invalidChangedAddrs);
      deps.log(
        `[runner] ${invalidChangedAddrs.size} pool(s) became unroutable; ${removedEdges / 2} removed from topology.`,
        "info",
        {
          event: "watcher_batch_remove_unroutable",
          changedPools: changedPools.size,
          invalidPools: invalidChangedAddrs.size,
          removedPools: removedEdges / 2,
          removedRoutes,
        },
      );
    }

    if (validChangedAddrs.size > 0) {
      deps.log(`[watcher] ${validChangedAddrs.size}/${changedPools.size} pool state(s) updated`, "info", {
        event: "watcher_batch_valid",
        changedPools: changedPools.size,
        validPools: validChangedAddrs.size,
      });
      const admitted = deps.admitPools(validChangedAddrs);
      if (admitted > 0) {
        deps.log(`[runner] Admitted ${admitted} newly routable pool(s); refreshing cycles soon.`, "info", {
          event: "watcher_batch_admit",
          changedPools: changedPools.size,
          validPools: validChangedAddrs.size,
          admittedPools: admitted,
        });
      }
      deps.updatePriceOracle(validChangedAddrs);
      await deps.revalidateCachedRoutes(validChangedAddrs);
    }
  }

  return {
    partitionChangedPools,
    handlePoolsChanged,
  };
}
