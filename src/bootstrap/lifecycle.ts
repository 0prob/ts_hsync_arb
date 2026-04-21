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
  onPoolsChanged: (event: { type: "pools_changed"; changedPools: Set<string> }) => Promise<void> | void;
  onReorgDetected: (event: { type: "reorg_detected"; reorgBlock: number; changedPools: Set<string> }) => Promise<void> | void;
  scheduleArb: (changedPools?: number) => void;
}) {
  deps.watcher.onBatch = (changedAddrs: Set<string>) => {
    Promise.resolve(deps.onPoolsChanged({
      type: "pools_changed",
      changedPools: changedAddrs,
    })).catch((err: any) => {
      deps.log(`Watcher batch handling failed: ${err?.message ?? err}`, "warn", {
        event: "watcher_batch_error",
        err,
      });
    });
    deps.scheduleArb(changedAddrs.size);
  };

  deps.watcher.onReorg = ({ reorgBlock, changedAddrs }: { reorgBlock: number; changedAddrs?: Iterable<string> | Array<string> }) => {
    const changedPools = new Set(
      changedAddrs instanceof Set
        ? changedAddrs
        : Array.isArray(changedAddrs)
          ? changedAddrs
          : changedAddrs
            ? [...changedAddrs]
            : [],
    );
    Promise.resolve(deps.onReorgDetected({
      type: "reorg_detected",
      reorgBlock,
      changedPools,
    })).catch((err: any) => {
      deps.log(`Watcher reorg handling failed: ${err?.message ?? err}`, "warn", {
        event: "watcher_reorg_error",
        err,
      });
    });
    deps.scheduleArb(changedPools.size);
  };
}
