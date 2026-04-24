import assert from "node:assert/strict";

import { createPassRunner } from "../src/runtime/pass_runner.ts";

{
  const events: string[] = [];
  const trackedTasks: Promise<unknown>[] = [];
  const logs: Array<{ msg: string; level?: string; meta?: any }> = [];
  let passCount = 0;
  let consecutiveErrors = 2;
  let botStateUpdate: any = null;

  const coordinator = createPassRunner({
    getStateCacheSize: () => 7,
    getCachedCycleCount: () => 3,
    incrementPassCount: () => ++passCount,
    getConsecutiveErrors: () => consecutiveErrors,
    incrementConsecutiveErrors: () => ++consecutiveErrors,
    resetConsecutiveErrors: () => {
      consecutiveErrors = 0;
      events.push("resetConsecutiveErrors");
    },
    setBotState: (update) => {
      botStateUpdate = update;
      events.push("setBotState");
    },
    log: (msg, level, meta) => {
      logs.push({ msg, level, meta });
      if (meta?.event) events.push(`log:${meta.event}`);
    },
    trackBackgroundTask: (task) => {
      trackedTasks.push(task);
      events.push("trackBackgroundTask");
    },
    maybeRunDiscovery: async () => {
      events.push("maybeRunDiscovery");
      return { discovered: 1 };
    },
    reconcileDiscoveryResult: async () => {
      events.push("reconcileDiscoveryResult");
    },
    refreshCycles: async () => {
      events.push("refreshCycles");
    },
    maybeHydrateQuietPools: async () => {
      events.push("maybeHydrateQuietPools");
    },
    refreshPriceOracleIfStale: () => {
      events.push("refreshPriceOracleIfStale");
    },
    searchOpportunities: async () => {
      events.push("searchOpportunities");
      return [
        {
          path: {
            startToken: "0xstart",
            edges: [{ protocol: "UNI_V2" }, { protocol: "UNI_V3" }],
          },
          result: { profit: 42n },
          assessment: { roi: 12345 },
        },
      ];
    },
    executeBatchIfIdle: async (candidates, reason) => {
      events.push(`executeBatchIfIdle:${candidates.length}:${reason}`);
    },
    formatProfit: (profit) => `${profit.toString()} token`,
    roiForCandidate: (candidate) => candidate.assessment?.roi ?? -Infinity,
    formatDuration: () => "5ms",
    sleep: async () => {
      events.push("sleep");
    },
    maxConsecutiveErrors: 3,
    maxExecutionBatch: 3,
  });

  await coordinator.runPass();
  await Promise.all(trackedTasks);

  assert.equal(passCount, 1);
  assert.equal(consecutiveErrors, 0);
  assert.deepEqual(botStateUpdate, {
    passCount: 1,
    consecutiveErrors: 2,
    opportunities: [{ Route: "UNI_V2 -> UNI_V3", Profit: "42 token", ROI: "1.23%" }],
  });
  assert.deepEqual(events, [
    "log:pass_start",
    "maybeRunDiscovery",
    "trackBackgroundTask",
    "refreshCycles",
    "reconcileDiscoveryResult",
    "maybeHydrateQuietPools",
    "trackBackgroundTask",
    "refreshPriceOracleIfStale",
    "searchOpportunities",
    "setBotState",
    "log:pass_opportunities",
    "log:pass_execute_best",
    "executeBatchIfIdle:1:run_pass",
    "log:pass_complete",
    "resetConsecutiveErrors",
  ]);
  assert.equal(logs.some((entry) => entry.meta?.event === "pass_complete"), true);
}

{
  const events: string[] = [];
  let consecutiveErrors = 1;

  const coordinator = createPassRunner({
    getStateCacheSize: () => 0,
    getCachedCycleCount: () => 0,
    incrementPassCount: () => 9,
    getConsecutiveErrors: () => consecutiveErrors,
    incrementConsecutiveErrors: () => {
      consecutiveErrors += 1;
      events.push(`incrementConsecutiveErrors:${consecutiveErrors}`);
      return consecutiveErrors;
    },
    resetConsecutiveErrors: () => {
      consecutiveErrors = 0;
      events.push("resetConsecutiveErrors");
    },
    setBotState: () => {
      events.push("setBotState");
    },
    log: (msg, _level, meta) => {
      if (meta?.event) events.push(`log:${meta.event}`);
      if (msg.includes("backing off")) events.push("log:backoff");
    },
    trackBackgroundTask: () => {
      events.push("trackBackgroundTask");
    },
    maybeRunDiscovery: async () => {
      throw new Error("should not run");
    },
    reconcileDiscoveryResult: async () => {},
    refreshCycles: async () => {
      throw new Error("boom");
    },
    maybeHydrateQuietPools: async () => {},
    refreshPriceOracleIfStale: () => {},
    searchOpportunities: async () => [],
    executeBatchIfIdle: async () => {},
    formatProfit: () => "",
    roiForCandidate: () => 0,
    formatDuration: () => "0ms",
    sleep: async (ms) => {
      events.push(`sleep:${ms}`);
    },
    maxConsecutiveErrors: 2,
    maxExecutionBatch: 1,
  });

  await coordinator.runPass();

  assert.deepEqual(events, [
    "log:pass_start",
    "trackBackgroundTask",
    "log:pass_failed",
    "incrementConsecutiveErrors:2",
    "log:backoff",
    "sleep:30000",
    "log:discovery_bg_error",
    "resetConsecutiveErrors",
  ]);
  assert.equal(consecutiveErrors, 0);
}

console.log("Pass runner checks passed.");
