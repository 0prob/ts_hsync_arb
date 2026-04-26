type LogLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace";
type LoggerFn = (msg: string, level?: LogLevel, meta?: unknown) => void;

type WatcherLike = {
  start: (cursor?: unknown) => Promise<unknown>;
  wait: () => Promise<unknown>;
  haltMeta?: { reason?: unknown } | null;
};

type BootModeDeps<Watcher extends WatcherLike, BotState> = {
  botState: BotState;
  setBotStatus: (status: "running") => void;
  setStopTui: (stopTui: (() => void) | null) => void;
  startTui: (botState: BotState) => Promise<() => void>;
  startMetricsServer: () => void;
  printBanner: () => void;
  loopMode: boolean;
  discoveryOnly: boolean;
  envioApiToken: string | null | undefined;
  runPass: () => Promise<void>;
  shutdown: () => Promise<void>;
  createWatcher: () => Watcher;
  setWatcher: (watcher: Watcher | null) => void;
  configureWatcher: (watcher: Watcher) => void;
  log: LoggerFn;
  fastArbDebounceMs: number;
  baseArbDebounceMs: number;
  heartbeatIntervalMs: number;
  formatDuration: (durationMs: number) => string;
  setWatcherHealthy: () => void;
  startHeartbeat: () => void;
  scheduleArb: () => void;
  stopHeartbeat: () => void;
};

export function createBootModeCoordinator<Watcher extends WatcherLike, BotState>(
  deps: BootModeDeps<Watcher, BotState>,
) {
  async function startOperatorSurface(tuiMode: boolean) {
    deps.setBotStatus("running");

    if (tuiMode) {
      deps.setStopTui(await deps.startTui(deps.botState));
      return;
    }

    deps.startMetricsServer();
    deps.printBanner();
  }

  async function runAfterBootstrap() {
    if (!deps.loopMode) {
      if (!deps.discoveryOnly) await deps.runPass();
      await deps.shutdown();
      return;
    }

    if (!deps.envioApiToken) {
      throw new Error("ENVIO_API_TOKEN is required for --loop watcher mode");
    }

    const watcher = deps.createWatcher();
    deps.setWatcher(watcher);
    deps.configureWatcher(watcher);

    deps.log(
      `Starting HyperSync polling watcher (debounce: ${deps.fastArbDebounceMs}-${deps.baseArbDebounceMs}ms adaptive, heartbeat: ${deps.formatDuration(deps.heartbeatIntervalMs)})...`,
      "info",
      {
        event: "watcher_start",
        debounceMs: deps.baseArbDebounceMs,
        fastDebounceMs: deps.fastArbDebounceMs,
        heartbeatMs: deps.heartbeatIntervalMs,
      },
    );

    await watcher.start(undefined);
    deps.setWatcherHealthy();
    deps.startHeartbeat();
    deps.scheduleArb();
    await watcher.wait();

    if (watcher.haltMeta) {
      throw new Error(`Watcher halted: ${String(watcher.haltMeta.reason ?? "unknown reason")}`);
    }

    deps.stopHeartbeat();
  }

  return {
    startOperatorSurface,
    runAfterBootstrap,
  };
}
