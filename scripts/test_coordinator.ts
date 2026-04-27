import assert from "node:assert/strict";
import { setImmediate as setImmediatePromise } from "node:timers/promises";

import { createArbScheduler, createShutdownHandler } from "../src/bootstrap/lifecycle.ts";

const recordedChangedPools: number[] = [];
const runErrors: string[] = [];
let runCount = 0;
let running = true;

const scheduler = createArbScheduler({
  isRunning: () => running,
  recordArbActivity: (changedPools) => {
    recordedChangedPools.push(changedPools);
  },
  getAdaptiveDebounceMs: () => 0,
  runPass: async () => {
    runCount++;
    throw new Error("pass failed");
  },
  onRunError: (err) => {
    runErrors.push(err instanceof Error ? err.message : String(err));
  },
});

scheduler.scheduleArb(2.9);
await scheduler.waitForIdle();

assert.equal(runCount, 1);
assert.deepEqual(recordedChangedPools, [2]);
assert.deepEqual(runErrors, ["pass failed"]);

scheduler.scheduleArb(Number.NaN);
await scheduler.waitForIdle();

assert.equal(runCount, 2);
assert.deepEqual(recordedChangedPools, [2, 0]);
assert.deepEqual(runErrors, ["pass failed", "pass failed"]);

running = false;
scheduler.scheduleArb(5);
await setImmediatePromise();
await scheduler.waitForIdle();

assert.equal(runCount, 2, "scheduler must not run passes after runtime stop");
assert.deepEqual(recordedChangedPools, [2, 0], "stopped scheduler must not record new activity");

{
  let queuedSchedulerRunning = true;
  let queuedRunCount = 0;
  const queuedScheduler = createArbScheduler({
    isRunning: () => queuedSchedulerRunning,
    recordArbActivity: () => {},
    getAdaptiveDebounceMs: () => 5,
    runPass: async () => {
      queuedRunCount++;
    },
  });

  queuedScheduler.scheduleArb();
  const idle = queuedScheduler.waitForIdle();
  queuedSchedulerRunning = false;
  await idle;
  assert.equal(
    queuedRunCount,
    0,
    "queued scheduler should skip the pass when runtime stops before debounce fires",
  );
}

class ShutdownExit extends Error {
  constructor(readonly code: number) {
    super(`exit:${code}`);
  }
}

function createShutdownHarness(options: { throwWatcherStop?: boolean } = {}) {
  const calls: string[] = [];
  const logs: Array<{ message: string; meta: any }> = [];
  const shutdown = createShutdownHandler({
    log: (message, _level, meta) => {
      logs.push({ message, meta });
    },
    setRunning: (next) => {
      calls.push(`running:${next}`);
    },
    stopHeartbeat: () => {
      calls.push("heartbeat");
    },
    cancelScheduledArb: () => {
      calls.push("cancel-arb");
    },
    getWatcher: () => ({
      stop: async () => {
        calls.push("watcher");
        if (options.throwWatcherStop) throw new Error("watcher stop failed");
      },
    }),
    waitForArbIdle: async () => {
      calls.push("arb-idle");
    },
    waitForBackgroundTasks: async () => {
      calls.push("background-idle");
    },
    stopTui: () => {
      calls.push("tui");
    },
    gasOracle: {
      stop: () => {
        calls.push("gas-oracle");
      },
    },
    workerPool: {
      terminate: async () => {
        calls.push("workers");
      },
    },
    getRegistry: () => ({
      close: () => {
        calls.push("registry");
      },
    }),
    stopMetricsServer: () => {
      calls.push("metrics");
    },
    exit: (code) => {
      calls.push(`exit:${code}`);
      throw new ShutdownExit(code);
    },
  });

  return { shutdown, calls, logs };
}

const signalShutdown = createShutdownHarness();
await assert.rejects(
  signalShutdown.shutdown("SIGTERM"),
  (err) => err instanceof ShutdownExit && err.code === 0,
);
assert.deepEqual(signalShutdown.calls, [
  "running:false",
  "heartbeat",
  "cancel-arb",
  "watcher",
  "arb-idle",
  "background-idle",
  "tui",
  "gas-oracle",
  "workers",
  "registry",
  "metrics",
  "exit:0",
]);
assert.deepEqual(signalShutdown.logs[0]?.meta, {
  event: "shutdown_start",
  reason: "signal",
  exitCode: 0,
  signal: "SIGTERM",
});

const fatalShutdown = createShutdownHarness();
await assert.rejects(
  fatalShutdown.shutdown(1, "fatal"),
  (err) => err instanceof ShutdownExit && err.code === 1,
);
assert.equal(fatalShutdown.logs[0]?.message, "Fatal error received; shutting down...");
assert.equal(fatalShutdown.logs[0]?.meta.reason, "fatal");
assert.equal(fatalShutdown.logs[0]?.meta.exitCode, 1);

const failingShutdown = createShutdownHarness({ throwWatcherStop: true });
await assert.rejects(
  failingShutdown.shutdown(1, "fatal"),
  (err) => err instanceof ShutdownExit && err.code === 1,
);
assert.ok(
  failingShutdown.calls.includes("workers") && failingShutdown.calls.includes("metrics"),
  "shutdown should continue cleanup after a failed step",
);
assert.equal(
  failingShutdown.logs.find((entry) => entry.meta?.event === "shutdown_cleanup_error")?.meta.step,
  "watcher",
);

console.log("Coordinator checks passed.");
