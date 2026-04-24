import assert from "node:assert/strict";

import { createReorgRecoveryCoordinator } from "../src/runtime/reorg_recovery.ts";

{
  const logs: Array<{ msg: string; meta: any }> = [];
  const events: string[] = [];

  const coordinator = createReorgRecoveryCoordinator({
    log: (msg, _level, meta) => {
      logs.push({ msg, meta });
    },
    clearRouteCache: () => {
      events.push("routeCache.clear");
    },
    clearTopologyCycles: () => {
      events.push("topology.clearCycles");
    },
    resetTopology: () => {
      events.push("topology.resetGraphs");
    },
    refreshPriceOracle: () => {
      events.push("oracle.update");
    },
  });

  coordinator.handleReorgDetected(501, new Set(["0xa", "0xb"]));

  assert.deepEqual(
    events,
    ["routeCache.clear", "topology.clearCycles", "topology.resetGraphs", "oracle.update"],
    "reorg recovery should clear routes, reset topology, and refresh oracle state in a fixed order",
  );
  assert.equal(logs.some(({ meta }) => meta?.event === "watcher_reorg" && meta?.reorgBlock === 501), true);
  assert.equal(logs.some(({ meta }) => meta?.event === "watcher_reorg_reload" && meta?.changedPools === 2), true);
}

{
  const logs: Array<{ msg: string; meta: any }> = [];

  const coordinator = createReorgRecoveryCoordinator({
    log: (msg, _level, meta) => {
      logs.push({ msg, meta });
    },
    clearRouteCache: () => {},
    clearTopologyCycles: () => {},
    resetTopology: () => {},
    refreshPriceOracle: () => {},
  });

  coordinator.handleReorgDetected(700, new Set());

  assert.equal(
    logs.some(({ meta }) => meta?.event === "watcher_reorg_reload"),
    false,
    "reorg recovery should skip the reload-footprint log when no changed pools were reloaded",
  );
}

console.log("Reorg recovery checks passed.");
