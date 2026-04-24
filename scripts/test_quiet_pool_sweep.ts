import assert from "node:assert/strict";

import { createQuietPoolSweepCoordinator } from "../src/runtime/quiet_pool_sweep.ts";

{
  const stateCache = new Map<string, Record<string, unknown>>([
    ["0xfresh", { timestamp: 1 }],
  ]);
  const logs: Array<{ msg: string; meta: any }> = [];
  const hydratedBatches: string[][] = [];
  const refreshed: boolean[] = [];

  const coordinator = createQuietPoolSweepCoordinator({
    getRegistryPools: () => [
      { pool_address: "0xFresh", protocol: "UNISWAP_V2", tokens: ["0xa", "0xb"] },
      { pool_address: "0xQuietA", protocol: "UNISWAP_V2", tokens: ["0xa", "0xb"] },
      { pool_address: "0xQuietB", protocol: "UNISWAP_V3", tokens: ["0xa", "0xc"] },
      { pool_address: "0xUnsupported", protocol: "UNKNOWN", tokens: ["0xa", "0xd"] },
    ],
    stateCache,
    log: (msg, _level, meta) => {
      logs.push({ msg, meta });
    },
    isHydratablePool: (pool) => pool.protocol !== "UNKNOWN",
    validatePoolState: (state) => ({ valid: Boolean(state?.timestamp) }),
    fetchAndCacheStates: async (pools) => {
      hydratedBatches.push(pools.map((pool) => pool.pool_address.toLowerCase()));
      stateCache.set("0xquieta", { timestamp: 1 });
      stateCache.set("0xquietb", { timestamp: 0 });
      return { hydrated: pools.length };
    },
    admitPools: (addresses) => addresses.size,
    refreshCycles: async (force = false) => {
      refreshed.push(force);
    },
    quietPoolSweepBatchSize: 4,
    quietPoolSweepIntervalMs: 0,
    quietPoolRetryBaseMs: 60_000,
    quietPoolRetryMaxMs: 300_000,
    v3NearWordRadius: 4,
    polygonHubTokens: new Set(["0xa", "0xb"]),
  });

  await coordinator.maybeHydrateQuietPools();
  await coordinator.maybeHydrateQuietPools();

  assert.deepEqual(
    hydratedBatches,
    [["0xquieta", "0xquietb"]],
    "quiet sweep should hydrate each eligible invalid pool once, then back off failing pools",
  );
  assert.deepEqual(refreshed, [true], "quiet sweep should force a refresh only when pools were admitted");
  assert.equal(
    logs.some(({ meta }) => meta?.event === "quiet_pool_sweep_complete" && meta?.failedPools === 1),
    true,
    "quiet sweep should surface failing pools in completion telemetry",
  );
  assert.equal(
    logs.some(({ meta }) => meta?.event === "quiet_pool_sweep_skipped" && meta?.coolingDownPools === 1),
    true,
    "quiet sweep should log when remaining invalid pools are cooling down",
  );
}

{
  const stateCache = new Map<string, Record<string, unknown>>();
  const refreshed: boolean[] = [];

  const coordinator = createQuietPoolSweepCoordinator({
    getRegistryPools: () => [{ pool_address: "0xQuietA", protocol: "UNISWAP_V2", tokens: ["0xa", "0xb"] }],
    stateCache,
    log: () => {},
    isHydratablePool: () => true,
    validatePoolState: () => ({ valid: false }),
    fetchAndCacheStates: async () => ({ hydrated: 1 }),
    admitPools: () => 0,
    refreshCycles: async (force = false) => {
      refreshed.push(force);
    },
    quietPoolSweepBatchSize: 1,
    quietPoolSweepIntervalMs: 0,
    quietPoolRetryBaseMs: 60_000,
    quietPoolRetryMaxMs: 300_000,
    v3NearWordRadius: 4,
    polygonHubTokens: new Set(["0xa"]),
  });

  await coordinator.maybeHydrateQuietPools();

  assert.deepEqual(refreshed, [], "quiet sweep should not rebuild cycles when no pools become admissible");
}

console.log("Quiet pool sweep checks passed.");
