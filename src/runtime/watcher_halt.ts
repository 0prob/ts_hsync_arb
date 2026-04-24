type LogLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace";
type LoggerFn = (msg: string, level?: LogLevel, meta?: unknown) => void;

type WatcherHaltDeps = {
  log: LoggerFn;
  setRunning: (running: boolean) => void;
  setBotStatus: (status: "idle" | "running" | "error") => void;
  cancelScheduledArb: () => void;
  stopHeartbeat: () => void;
  recordWatcherHalt: (payload: Record<string, unknown>) => void;
};

export function createWatcherHaltCoordinator(deps: WatcherHaltDeps) {
  function handleHaltDetected(payload: Record<string, unknown>) {
    deps.setRunning(false);
    deps.setBotStatus("error");
    deps.cancelScheduledArb();
    deps.stopHeartbeat();
    deps.recordWatcherHalt(payload);
    deps.log("[runner] Watcher halted; arb loop disabled until restart", "error", {
      event: "watcher_halt",
      ...payload,
    });
  }

  return {
    handleHaltDetected,
  };
}
