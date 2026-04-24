type LogLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace";
type LoggerFn = (msg: string, level?: LogLevel, meta?: unknown) => void;

type ReorgRecoveryDeps = {
  log: LoggerFn;
  clearRouteCache: () => void;
  clearTopologyCycles: () => void;
  resetTopology: () => void;
  refreshPriceOracle: () => void;
};

export function createReorgRecoveryCoordinator(deps: ReorgRecoveryDeps) {
  function handleReorgDetected(reorgBlock: number, changedPools: Set<string>) {
    deps.log(`[runner] Reorg rollback to block ${reorgBlock}; clearing cached routes and topology`, "warn", {
      event: "watcher_reorg",
      reorgBlock,
      changedPools: changedPools.size,
    });

    deps.clearRouteCache();
    deps.clearTopologyCycles();
    deps.resetTopology();
    deps.refreshPriceOracle();

    if (changedPools.size > 0) {
      deps.log(`[runner] Reorg cache reload touched ${changedPools.size} active pool(s)`, "debug", {
        event: "watcher_reorg_reload",
        changedPools: changedPools.size,
      });
    }
  }

  return {
    handleReorgDetected,
  };
}
