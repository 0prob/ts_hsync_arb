import assert from "node:assert/strict";

import { createQuietPoolSweepCoordinator } from "../src/runtime/quiet_pool_sweep.ts";
import { validatePoolState } from "../src/state/normalizer.ts";

const pool = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const tokenA = "0x1111111111111111111111111111111111111111";
const tokenB = "0x2222222222222222222222222222222222222222";

function balancerZeroBalanceState() {
  return {
    poolId: pool,
    protocol: "BALANCER_V2",
    token0: tokenA,
    token1: tokenB,
    tokens: [tokenA, tokenB],
    balances: [0n, 1_000n],
    weights: [5n * 10n ** 17n, 5n * 10n ** 17n],
    swapFee: 3_000_000_000_000_000n,
    timestamp: Date.now(),
  };
}

function createHarness() {
  const stateCache = new Map<string, any>();
  const logs: Array<{ message: string; level?: string; meta?: any }> = [];
  let fetchCalls = 0;
  let admittedPools = 0;
  const poolRecord = {
    pool_address: pool,
    protocol: "BALANCER_V2",
    tokens: [tokenA, tokenB],
    metadata: {},
    status: "active",
  };

  const coordinator = createQuietPoolSweepCoordinator({
    getRegistryPools: () => [poolRecord],
    stateCache,
    log: (message, level, meta) => logs.push({ message, level, meta }),
    isHydratablePool: () => true,
    validatePoolState,
    fetchAndCacheStates: async () => {
      fetchCalls++;
      stateCache.set(pool, balancerZeroBalanceState());
      return {
        scheduled: 1,
        fetched: 1,
        normalized: 1,
        observedUnroutable: 1,
        disabled: 0,
        failed: 0,
        protocols: {},
      };
    },
    admitPools: (addresses) => {
      admittedPools += addresses.size;
      return addresses.size;
    },
    refreshCycles: async () => {},
    quietPoolSweepBatchSize: 10,
    quietPoolSweepIntervalMs: 0,
    quietPoolRetryBaseMs: 60_000,
    quietPoolRetryMaxMs: 60_000,
    v3NearWordRadius: 2,
    polygonHubTokens: new Set([tokenA, tokenB]),
  });

  return { coordinator, fetchCalls: () => fetchCalls, admittedPools: () => admittedPools, logs, stateCache };
}

{
  const { coordinator, fetchCalls, admittedPools, logs } = createHarness();

  await coordinator.maybeHydrateQuietPools();
  await coordinator.maybeHydrateQuietPools();

  const complete = logs.find((entry) => entry.meta?.event === "quiet_pool_sweep_complete");
  assert.equal(fetchCalls(), 1, "observed unroutable Balancer state should not be repeatedly hydrated");
  assert.equal(admittedPools(), 0, "observed unroutable pools must not be admitted into routing");
  assert.equal(complete?.meta?.observedUnroutablePools, 1);
  assert.equal(complete?.meta?.failedPools, 0);
  assert.deepEqual(complete?.meta?.validationReasons, { "Balancer: zero balance": 1 });

  const skipped = logs.find((entry) => entry.meta?.event === "quiet_pool_sweep_skipped");
  assert.equal(skipped?.meta?.observedUnroutablePools, 1);
}

console.log("Quiet-pool sweep checks passed.");
