import assert from "node:assert/strict";
import { setImmediate as setImmediatePromise } from "node:timers/promises";

import {
  configureWatcherCallbacks,
  createArbScheduler,
  createShutdownHandler,
} from "../src/bootstrap/lifecycle.ts";

async function testSchedulerWaitForIdle() {
  let running = true;
  let runCount = 0;
  let releaseCurrentRun: (() => void) | null = null;
  const runStartQueue: Array<() => void> = [];

  const scheduler = createArbScheduler({
    isRunning: () => running,
    recordArbActivity: () => {},
    getAdaptiveDebounceMs: () => 0,
    runPass: async () => {
      runCount += 1;
      runStartQueue.shift()?.();
      await new Promise<void>((resolve) => {
        releaseCurrentRun = resolve;
      });
    },
  });

  const firstRunStarted = new Promise<void>((resolve) => {
    runStartQueue.push(resolve);
  });

  scheduler.scheduleArb(1);
  await firstRunStarted;

  const idlePromise = scheduler.waitForIdle();
  let idleResolved = false;
  void idlePromise.then(() => {
    idleResolved = true;
  });
  await Promise.resolve();
  assert.equal(idleResolved, false, "waitForIdle should stay pending while the pass is still running");

  const secondRunStarted = new Promise<void>((resolve) => {
    runStartQueue.push(resolve);
  });
  scheduler.scheduleArb(1);
  releaseCurrentRun?.();
  await secondRunStarted;
  assert.equal(runCount, 2, "dirty scheduling should produce exactly one follow-up pass");

  releaseCurrentRun?.();
  await idlePromise;

  running = false;
  scheduler.cancelScheduledArb();
}

async function testShutdownWaitsForOwnedWork() {
  const events: string[] = [];
  let releaseWatcherStop: (() => void) | null = null;
  let releaseArbIdle: (() => void) | null = null;
  let releaseBackgroundTasks: (() => void) | null = null;
  let arbIdleStartedResolve: (() => void) | null = null;
  let backgroundTasksStartedResolve: (() => void) | null = null;
  const arbIdleStarted = new Promise<void>((resolve) => {
    arbIdleStartedResolve = resolve;
  });
  const backgroundTasksStarted = new Promise<void>((resolve) => {
    backgroundTasksStartedResolve = resolve;
  });

  const shutdown = createShutdownHandler({
    log: () => {},
    setRunning: () => {
      events.push("setRunning");
    },
    stopHeartbeat: () => {
      events.push("stopHeartbeat");
    },
    cancelScheduledArb: () => {
      events.push("cancelScheduledArb");
    },
    stopTui: () => {
      events.push("stopTui");
    },
    getWatcher: () => ({
      stop: async () => {
        events.push("watcher.stop:start");
        await new Promise<void>((resolve) => {
          releaseWatcherStop = resolve;
        });
        events.push("watcher.stop:end");
      },
    }),
    gasOracle: {
      stop: () => {
        events.push("gasOracle.stop");
      },
    },
    getRegistry: () => ({
      close: () => {
        events.push("registry.close");
      },
    }),
    workerPool: {
      terminate: async () => {
        events.push("workerPool.terminate");
      },
    },
    stopMetricsServer: () => {
      events.push("stopMetricsServer");
    },
    waitForArbIdle: async () => {
      events.push("waitForArbIdle:start");
      arbIdleStartedResolve?.();
      await new Promise<void>((resolve) => {
        releaseArbIdle = resolve;
      });
      events.push("waitForArbIdle:end");
    },
    waitForBackgroundTasks: async () => {
      events.push("waitForBackgroundTasks:start");
      backgroundTasksStartedResolve?.();
      await new Promise<void>((resolve) => {
        releaseBackgroundTasks = resolve;
      });
      events.push("waitForBackgroundTasks:end");
    },
    exit: (() => {
      events.push("exit");
      return undefined as never;
    }) as (code: number) => never,
  });

  const shutdownPromise = shutdown();
  await Promise.resolve();
  assert.deepEqual(events, [
    "setRunning",
    "stopHeartbeat",
    "cancelScheduledArb",
    "watcher.stop:start",
  ]);

  releaseWatcherStop?.();
  await arbIdleStarted;
  assert.equal(events.includes("stopTui"), false, "shutdown should not stop UI before owned work drains");

  releaseArbIdle?.();
  await backgroundTasksStarted;
  releaseBackgroundTasks?.();
  await shutdownPromise;

  assert.deepEqual(events, [
    "setRunning",
    "stopHeartbeat",
    "cancelScheduledArb",
    "watcher.stop:start",
    "watcher.stop:end",
    "waitForArbIdle:start",
    "waitForArbIdle:end",
    "waitForBackgroundTasks:start",
    "waitForBackgroundTasks:end",
    "stopTui",
    "gasOracle.stop",
    "workerPool.terminate",
    "registry.close",
    "stopMetricsServer",
    "exit",
  ]);
}

async function testWatcherCallbacksScheduleAfterStateWork() {
  const steps: string[] = [];
  let releaseBatch: (() => void) | null = null;
  const watcher: {
    onBatch: ((changed: Set<string>) => void) | null;
    onReorg: ((payload: { reorgBlock: number; changedAddrs?: Iterable<string> }) => void) | null;
  } = {
    onBatch: null,
    onReorg: null,
  };

  configureWatcherCallbacks({
    watcher,
    log: () => {},
    onPoolsChanged: async () => {
      steps.push("batch:start");
      await new Promise<void>((resolve) => {
        releaseBatch = resolve;
      });
      steps.push("batch:end");
    },
    onReorgDetected: () => {
      steps.push("reorg");
    },
    scheduleArb: (changedPools = 0) => {
      steps.push(`schedule:${changedPools}`);
    },
  });

  watcher.onBatch?.(new Set(["0xa", "0xb"]));
  await Promise.resolve();
  assert.deepEqual(steps, ["batch:start"], "scheduler should wait for the watcher batch handler");

  releaseBatch?.();
  await Promise.resolve();
  await Promise.resolve();
  await setImmediatePromise();
  assert.equal(steps.join("|"), "batch:start|batch:end|schedule:2");

  watcher.onReorg?.({ reorgBlock: 12, changedAddrs: ["0xa"] });
  await Promise.resolve();
  await Promise.resolve();
  await setImmediatePromise();
  assert.equal(steps.join("|"), "batch:start|batch:end|schedule:2|reorg|schedule:1");
}

await testSchedulerWaitForIdle();
await testShutdownWaitsForOwnedWork();
await testWatcherCallbacksScheduleAfterStateWork();

console.log("Lifecycle checks passed.");
