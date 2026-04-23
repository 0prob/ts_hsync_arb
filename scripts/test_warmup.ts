import assert from "node:assert/strict";

import { createWarmupManager } from "../src/bootstrap/warmup.ts";
import { validatePoolState } from "../src/state/normalizer.ts";

const HUB_A = "0x1111111111111111111111111111111111111111";
const HUB_B = "0x2222222222222222222222222222222222222222";
const NON_HUB = "0x3333333333333333333333333333333333333333";
const POOL = "0x4444444444444444444444444444444444444444";
const ONE_HUB_POOL = "0x5555555555555555555555555555555555555555";
const V3_A = "0x7777777777777777777777777777777777777771";
const V3_B = "0x7777777777777777777777777777777777777772";
const V3_C = "0x7777777777777777777777777777777777777773";

const pool = {
  pool_address: POOL,
  protocol: "BALANCER_V2",
  status: "active",
  tokens: [NON_HUB, HUB_A, HUB_B],
  metadata: {},
};

const oneHubPool = {
  pool_address: ONE_HUB_POOL,
  protocol: "BALANCER_V2",
  status: "active",
  tokens: [NON_HUB, HUB_A, "0x6666666666666666666666666666666666666666"],
  metadata: {},
};

const v3Pools = [V3_A, V3_B, V3_C].map((poolAddress, index) => ({
  pool_address: poolAddress,
  protocol: "UNISWAP_V3",
  status: "active",
  tokens: [
    index === 0 ? HUB_A : HUB_B,
    index === 2 ? NON_HUB : HUB_B,
  ],
  metadata: {},
}));

let balancerFetches = 0;
let v3Fetches = 0;
let v3FullFetches = 0;
let v3NearbyFetches = 0;
const stateCache = new Map<string, Record<string, any>>();

const warmupManager = createWarmupManager({
  getRegistry: () => ({
    getPools: () => [pool, oneHubPool, ...v3Pools],
    getActivePoolsMeta: () => [pool, oneHubPool, ...v3Pools],
    getCheckpoint: () => ({ last_block: 123 }),
    getGlobalCheckpoint: () => 123,
    batchUpdateStates: () => {},
    disablePool: () => {
      throw new Error("warmup should not disable the multi-token hub pool");
    },
  }),
  stateCache,
  log: () => {},
  getPoolTokens: (entry: any) => entry.tokens,
  getPoolMetadata: (entry: any) => entry.metadata ?? {},
  validatePoolState,
  normalizePoolState: () => null,
  fetchMultipleV2States: async () => new Map(),
  fetchMultipleV3States: async (addresses: string[], _concurrency: number, _poolMeta: Map<any, any>, _onProgress: any, fetchOptions?: { hydrationMode?: string }) => {
    v3Fetches += addresses.length;
    if (fetchOptions?.hydrationMode === "full") v3FullFetches += addresses.length;
    if (fetchOptions?.hydrationMode === "nearby") v3NearbyFetches += addresses.length;
    const states = new Map();
    for (const address of addresses) {
      states.set(address.toLowerCase(), {
        sqrtPriceX96: 1n << 96n,
        tick: 0,
        liquidity: 1000n,
        tickSpacing: 60,
        ticks: new Map(),
        initialized: true,
        fetchedAt: Date.now(),
      });
    }
    return states;
  },
  fetchAndNormalizeBalancerPool: async (entry: any) => {
    balancerFetches += 1;
    return {
      addr: entry.pool_address.toLowerCase(),
      normalized: {
        poolId: entry.pool_address.toLowerCase(),
        protocol: entry.protocol,
        token0: entry.tokens[0],
        token1: entry.tokens[1],
        tokens: entry.tokens,
        fee: 3_000_000_000_000_000n,
        balances: [1_000n, 1_000n, 1_000n],
        weights: [333_333_333_333_333_333n, 333_333_333_333_333_333n, 333_333_333_333_333_334n],
        swapFee: 3_000_000_000_000_000n,
        timestamp: Date.now(),
      },
    };
  },
  fetchAndNormalizeCurvePool: async () => {
    throw new Error("curve fetch should not be used in this warmup test");
  },
  throttledMap: async <T, R>(items: T[], mapper: (item: T) => Promise<R>) => Promise.all(items.map(mapper)),
  polygonHubTokens: new Set([HUB_A, HUB_B]),
  hub4Tokens: new Set([HUB_A, HUB_B]),
  maxSyncWarmupPools: 10,
  maxSyncWarmupV3Pools: 2,
  maxSyncWarmupOneHubPools: 10,
  v2PollConcurrency: 1,
  v3PollConcurrency: 1,
  enrichConcurrency: 1,
});

warmupManager.seedStateCache();
await warmupManager.warmupStateCache();

assert.equal(
  balancerFetches,
  2,
  "warmup should fetch both hub-pair pools and one-hub extension pools during synchronous startup coverage",
);
assert.equal(
  v3Fetches,
  3,
  "warmup should keep all eligible V3 pools in the sync warmup set instead of dropping them after the full-hydration budget",
);
assert.equal(
  v3FullFetches,
  2,
  "warmup should fully hydrate only the top-ranked V3 subset",
);
assert.equal(
  v3NearbyFetches,
  1,
  "warmup should downgrade overflow V3 pools to nearby hydration instead of skipping them",
);
assert.equal(
  validatePoolState(stateCache.get(pool.pool_address.toLowerCase())).valid,
  true,
  "warmup should leave the admitted multi-token hub pool routable in the state cache",
);

console.log("Warmup checks passed.");
