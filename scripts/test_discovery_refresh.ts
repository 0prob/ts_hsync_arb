import assert from "node:assert/strict";

import { createDiscoveryRefreshCoordinator, seedNewPoolsIntoStateCache } from "../src/runtime/discovery_refresh.ts";

{
  const stateCache = new Map<string, Record<string, unknown>>([
    ["0xpoola", { poolId: "0xpoola", protocol: "EXISTING", tokens: ["0xold"], timestamp: 5 }],
  ]);

  const seeded = seedNewPoolsIntoStateCache(
    [
      { pool_address: "0xPoolA", protocol: "EXISTING", tokens: ["0xignored"] },
      { pool_address: "0xPoolB", protocol: "UNISWAP_V2", tokens: '["0xToken0","0xTOKEN1"]' },
    ],
    stateCache,
  );

  assert.deepEqual(
    seeded.map((pool) => pool.pool_address),
    ["0xPoolB"],
    "only unseen pools should be seeded into the live state cache",
  );
  assert.deepEqual(
    stateCache.get("0xpoolb"),
    {
      poolId: "0xpoolb",
      protocol: "UNISWAP_V2",
      tokens: ["0xtoken0", "0xtoken1"],
      timestamp: 0,
    },
    "seeded pools should normalize token addresses and initialize an empty timestamp",
  );
}

{
  const stateCache = new Map<string, Record<string, unknown>>();
  const watcherAdds: string[][] = [];
  const claimed: string[][] = [];
  const released: string[][] = [];
  const clearedRetries: string[] = [];
  const recordedFailures: Array<{ address: string; reason: string }> = [];
  const invalidations: string[] = [];
  const refreshes: boolean[] = [];

  const coordinator = createDiscoveryRefreshCoordinator({
    isRunning: () => true,
    log: () => {},
    getRepositories: () => ({
      pools: {
        invalidateMetaCache: () => {
          invalidations.push("meta_cache");
        },
        getActiveMeta: () => [
          { pool_address: "0xPoolB", protocol: "UNISWAP_V2", tokens: ["0xToken0", "0xToken1"] },
          { pool_address: "0xPoolC", protocol: "UNISWAP_V3", tokens: ["0xToken2", "0xToken3"] },
          { pool_address: "0xPoolD", protocol: "UNSUPPORTED", tokens: ["0xToken4", "0xToken5"] },
        ],
      },
    }),
    stateCache,
    getWatcher: () => ({
      addPools: async (poolAddresses: string[]) => {
        watcherAdds.push(poolAddresses);
      },
    }),
    isHydratablePool: (pool) => pool.protocol !== "UNSUPPORTED",
    claimDeferredHydration: (pools) => {
      claimed.push(pools.map((pool) => pool.pool_address.toLowerCase()));
      return pools;
    },
    releaseDeferredHydration: (pools) => {
      released.push(pools.map((pool) => pool.pool_address.toLowerCase()));
    },
    fetchAndCacheStates: async (pools) => {
      for (const pool of pools) {
        const addr = pool.pool_address.toLowerCase();
        stateCache.set(addr, {
          ...(stateCache.get(addr) ?? {}),
          timestamp: addr === "0xpoolb" ? 1 : 0,
        });
      }
      return { hydrated: pools.length };
    },
    validatePoolState: (state) => ({ valid: Boolean(state?.timestamp) }),
    clearDeferredHydrationRetry: (address) => {
      clearedRetries.push(address);
    },
    recordDeferredHydrationFailure: (address, reason) => {
      recordedFailures.push({ address, reason });
    },
    topology: {
      invalidate: (reason) => {
        invalidations.push(reason ?? "unknown");
      },
    },
    refreshCycles: async (force = false) => {
      refreshes.push(force);
    },
    v3NearWordRadius: 8,
  });

  await coordinator.reconcileDiscoveryResult({ totalDiscovered: 3 });

  assert.deepEqual(
    watcherAdds,
    [["0xpoolb", "0xpoolc", "0xpoold"]],
    "newly discovered pools should be normalized before extending the watcher filter",
  );
  assert.deepEqual(
    claimed,
    [["0xpoolb", "0xpoolc"]],
    "only supported protocols should enter deferred hydration",
  );
  assert.deepEqual(released, claimed, "claimed deferred hydrations should always be released");
  assert.deepEqual(clearedRetries, ["0xpoolb"], "routable discovery hydrations should clear retry backoff");
  assert.deepEqual(
    recordedFailures,
    [{ address: "0xpoolc", reason: "state_not_routable_after_discovery_hydration" }],
    "unroutable discovery hydrations should enter retry backoff",
  );
  assert.deepEqual(
    invalidations,
    ["meta_cache", "background_discovery"],
    "discovery aftermath should invalidate registry metadata and topology once",
  );
  assert.deepEqual(refreshes, [true], "newly discovered pools should force a cycle refresh");
}

{
  const stateCache = new Map<string, Record<string, unknown>>();
  let running = true;
  let hydrated = false;
  let refreshed = false;

  const coordinator = createDiscoveryRefreshCoordinator({
    isRunning: () => running,
    log: () => {},
    getRepositories: () => ({
      pools: {
        invalidateMetaCache: () => {},
        getActiveMeta: () => [{ pool_address: "0xPoolB", protocol: "UNISWAP_V2", tokens: ["0xToken0", "0xToken1"] }],
      },
    }),
    stateCache,
    getWatcher: () => ({
      addPools: async () => {
        running = false;
      },
    }),
    isHydratablePool: () => true,
    claimDeferredHydration: (pools) => pools,
    releaseDeferredHydration: () => {},
    fetchAndCacheStates: async () => {
      hydrated = true;
    },
    validatePoolState: () => ({ valid: true }),
    clearDeferredHydrationRetry: () => {},
    recordDeferredHydrationFailure: () => {},
    topology: {
      invalidate: () => {
        refreshed = true;
      },
    },
    refreshCycles: async () => {
      refreshed = true;
    },
    v3NearWordRadius: 8,
  });

  await coordinator.reconcileDiscoveryResult({ totalDiscovered: 1 });

  assert.equal(hydrated, false, "discovery hydration should stop if runtime halts after watcher update");
  assert.equal(refreshed, false, "topology refresh should not run after runtime shutdown");
}

console.log("Discovery refresh checks passed.");
