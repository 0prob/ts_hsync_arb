import assert from "node:assert/strict";

import { createWatcherBatchCoordinator } from "../src/runtime/watcher_batch.ts";

{
  const stateCache = new Map<string, Record<string, unknown>>([
    ["0xvalid", { timestamp: 1 }],
    ["0xinvalid", { timestamp: 0 }],
  ]);
  const logs: Array<{ msg: string; meta: any }> = [];
  const debugged: Array<{ addr: string; reason?: string }> = [];
  const removedPools: string[][] = [];
  const removedRoutes: string[][] = [];
  const admittedPools: string[][] = [];
  const oracleUpdates: string[][] = [];
  const revalidated: string[][] = [];

  const coordinator = createWatcherBatchCoordinator({
    stateCache,
    log: (msg, _level, meta) => {
      logs.push({ msg, meta });
    },
    validatePoolState: (state) =>
      state?.timestamp
        ? { valid: true }
        : { valid: false, reason: "invalid state" },
    debugInvalidPool: (addr, reason) => {
      debugged.push({ addr, reason });
    },
    removePoolsFromTopology: (poolAddresses) => {
      removedPools.push([...poolAddresses]);
      return poolAddresses.size * 2;
    },
    removeRoutesByPools: (poolAddresses) => {
      removedRoutes.push([...poolAddresses]);
      return poolAddresses.size;
    },
    admitPools: (poolAddresses) => {
      admittedPools.push([...poolAddresses]);
      return poolAddresses.size;
    },
    updatePriceOracle: (changedPools) => {
      oracleUpdates.push([...(changedPools ?? [])] as string[]);
    },
    revalidateCachedRoutes: async (changedPools) => {
      revalidated.push([...changedPools]);
    },
  });

  await coordinator.handlePoolsChanged(new Set(["0xvalid", "0xinvalid"]));

  assert.deepEqual(debugged, [{ addr: "0xinvalid", reason: "invalid state" }]);
  assert.deepEqual(removedPools, [["0xinvalid"]], "unroutable pools should be removed from topology");
  assert.deepEqual(removedRoutes, [["0xinvalid"]], "unroutable pools should evict cached routes");
  assert.deepEqual(admittedPools, [["0xvalid"]], "valid pools should be offered for topology admission");
  assert.deepEqual(oracleUpdates, [["0xvalid"]], "only valid changed pools should refresh targeted oracle state");
  assert.deepEqual(revalidated, [["0xvalid"]], "only valid changed pools should trigger route revalidation");
  assert.equal(logs.some(({ meta }) => meta?.event === "watcher_batch_remove_unroutable"), true);
  assert.equal(logs.some(({ meta }) => meta?.event === "watcher_batch_valid"), true);
  assert.equal(logs.some(({ meta }) => meta?.event === "watcher_batch_admit" && meta?.admittedPools === 1), true);
}

{
  const logs: Array<{ msg: string; meta: any }> = [];
  let revalidated = false;

  const coordinator = createWatcherBatchCoordinator({
    stateCache: new Map(),
    log: (msg, _level, meta) => {
      logs.push({ msg, meta });
    },
    validatePoolState: () => ({ valid: false, reason: "missing" }),
    removePoolsFromTopology: () => 0,
    removeRoutesByPools: () => 0,
    admitPools: () => 0,
    updatePriceOracle: () => {},
    revalidateCachedRoutes: async () => {
      revalidated = true;
    },
  });

  await coordinator.handlePoolsChanged(new Set());

  assert.equal(revalidated, false, "empty watcher batches should not trigger revalidation");
  assert.equal(logs.some(({ meta }) => meta?.event === "watcher_batch_skip"), true);
}

console.log("Watcher batch checks passed.");
