type LogLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace";
type LoggerFn = (msg: string, level?: LogLevel, meta?: unknown) => void;

type StoppableWatcher = {
  stop: () => Promise<void>;
};

type ShutdownRegistry = {
  close: () => void;
};

type StoppableOracle = {
  stop: () => void;
};

function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

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
  const idleResolvers = new Set<() => void>();

  function flushIdleWaiters() {
    if (arbQueued || arbRunning || arbDirty || arbTimer) return;
    if (idleResolvers.size === 0) return;
    const resolvers = [...idleResolvers];
    idleResolvers.clear();
    for (const resolve of resolvers) resolve();
  }

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
          return;
        }
        flushIdleWaiters();
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
    flushIdleWaiters();
  }

  function waitForIdle() {
    if (!arbQueued && !arbRunning && !arbDirty && !arbTimer) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      idleResolvers.add(resolve);
    });
  }

  return { scheduleArb, cancelScheduledArb, waitForIdle };
}

export function createShutdownHandler(deps: {
  log: LoggerFn;
  setRunning: (running: boolean) => void;
  stopTui: () => void;
  getWatcher: () => StoppableWatcher | null;
  gasOracle: StoppableOracle | null;
  getRegistry: () => ShutdownRegistry | null;
  workerPool: { terminate: () => Promise<void> };
  stopMetricsServer: () => void;
  stopHeartbeat?: () => void;
  cancelScheduledArb?: () => void;
  waitForArbIdle?: () => Promise<void>;
  waitForBackgroundTasks?: () => Promise<void>;
  exit: (code: number) => never;
}) {
  let shutdownPromise: Promise<void> | null = null;

  return async function shutdown() {
    if (shutdownPromise) return shutdownPromise;
    shutdownPromise = (async () => {
      deps.log("Shutdown signal received...");
      deps.setRunning(false);
      deps.stopHeartbeat?.();
      deps.cancelScheduledArb?.();
      const watcher = deps.getWatcher();
      if (watcher) await watcher.stop();
      await deps.waitForArbIdle?.();
      await deps.waitForBackgroundTasks?.();
      deps.stopTui();
      if (deps.gasOracle) deps.gasOracle.stop();
      await deps.workerPool.terminate();
      const registry = deps.getRegistry();
      if (registry) registry.close();
      deps.stopMetricsServer();
      deps.exit(0);
    })();
    return shutdownPromise;
  };
}

export function configureWatcherCallbacks(deps: {
  watcher: {
    onBatch: ((changedAddrs: Set<string>) => void) | null;
    onReorg: ((payload: { reorgBlock: number; changedAddrs?: Iterable<string> | Array<string> }) => void) | null;
    onHalt: ((payload: Record<string, unknown>) => void) | null;
  };
  log: LoggerFn;
  onPoolsChanged: (event: { type: "pools_changed"; changedPools: Set<string> }) => Promise<void> | void;
  onReorgDetected: (event: { type: "reorg_detected"; reorgBlock: number; changedPools: Set<string> }) => Promise<void> | void;
  onHaltDetected?: (event: { type: "watcher_halt"; payload: Record<string, unknown> }) => Promise<void> | void;
  scheduleArb: (changedPools?: number) => void;
}) {
  deps.watcher.onBatch = (changedAddrs: Set<string>) => {
    Promise.resolve(deps.onPoolsChanged({
      type: "pools_changed",
      changedPools: changedAddrs,
    })).catch((err: unknown) => {
      deps.log(`Watcher batch handling failed: ${errorMessage(err)}`, "warn", {
        event: "watcher_batch_error",
        err,
      });
    }).finally(() => {
      deps.scheduleArb(changedAddrs.size);
    });
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
    })).catch((err: unknown) => {
      deps.log(`Watcher reorg handling failed: ${errorMessage(err)}`, "warn", {
        event: "watcher_reorg_error",
        err,
      });
    }).finally(() => {
      deps.scheduleArb(changedPools.size);
    });
  };

  deps.watcher.onHalt = (payload: Record<string, unknown>) => {
    Promise.resolve(deps.onHaltDetected?.({
      type: "watcher_halt",
      payload,
    })).catch((err: unknown) => {
      deps.log(`Watcher halt handling failed: ${errorMessage(err)}`, "warn", {
        event: "watcher_halt_error",
        err,
      });
    });
  };
}
