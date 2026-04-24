import assert from "node:assert/strict";

import { createWarmupManager } from "../src/bootstrap/warmup.ts";
import { validatePoolState } from "../src/state/normalizer.ts";

const HUB_A = "0x1111111111111111111111111111111111111111";
const HUB_B = "0x2222222222222222222222222222222222222222";
const HUB_C = "0x1212121212121212121212121212121212121212";
const NON_HUB = "0x3333333333333333333333333333333333333333";
const POOL = "0x4444444444444444444444444444444444444444";
const ONE_HUB_POOL = "0x5555555555555555555555555555555555555555";
const V3_A = "0x7777777777777777777777777777777777777771";
const V3_B = "0x7777777777777777777777777777777777777772";
const V3_C = "0x7777777777777777777777777777777777777773";
const V3_D = "0x7777777777777777777777777777777777777774";
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

{
  const kyberPool = {
    pool_address: V3_D,
    protocol: "KYBERSWAP_ELASTIC",
    status: "active",
    tokens: [HUB_A, HUB_B],
    metadata: { fee: 500, tickSpacing: 10 },
  };
  const unsupportedPool = {
    pool_address: "0x7777777777777777777777777777777777777775",
    protocol: "UNKNOWN_DEX",
    status: "active",
    tokens: [HUB_A, HUB_B],
    metadata: {},
  };
  let fetchedAddresses: string[] = [];
  const logs: Array<{ msg: string; meta: any }> = [];

  const coverageWarmup = createWarmupManager({
    getRegistry: () => ({
      getPools: () => [kyberPool, unsupportedPool],
      getActivePoolsMeta: () => [kyberPool, unsupportedPool],
      getCheckpoint: () => ({ last_block: 123 }),
      getGlobalCheckpoint: () => 123,
      batchUpdateStates: () => {},
      disablePool: () => {},
    }),
    stateCache: new Map<string, Record<string, any>>(),
    log: (msg: string, _level?: string, meta?: any) => {
      logs.push({ msg, meta });
    },
    getPoolTokens: (entry: any) => entry.tokens,
    getPoolMetadata: (entry: any) => entry.metadata ?? {},
    validatePoolState,
    normalizePoolState: (_addr: string, protocol: string, tokens: string[], rawState: any) => ({
      poolId: kyberPool.pool_address.toLowerCase(),
      protocol,
      token0: tokens[0],
      token1: tokens[1],
      tokens,
      fee: BigInt(rawState.fee ?? 500),
      sqrtPriceX96: rawState.sqrtPriceX96,
      tick: rawState.tick,
      liquidity: rawState.liquidity,
      tickSpacing: rawState.tickSpacing,
      ticks: rawState.ticks,
      initialized: rawState.initialized,
      timestamp: rawState.fetchedAt,
    }),
    fetchMultipleV2States: async () => new Map(),
    fetchMultipleV3States: async (addresses: string[]) => {
      fetchedAddresses = addresses.map((address) => address.toLowerCase());
      const states = new Map<string, Record<string, any>>();
      for (const address of fetchedAddresses) {
        states.set(address, {
          sqrtPriceX96: 1n << 96n,
          tick: 0,
          liquidity: 1000n,
          fee: 500,
          tickSpacing: 10,
          ticks: new Map(),
          initialized: true,
          fetchedAt: Date.now(),
        });
      }
      return states;
    },
    fetchAndNormalizeBalancerPool: async () => {
      throw new Error("balancer fetch should not be used in Kyber warmup coverage test");
    },
    fetchAndNormalizeCurvePool: async () => {
      throw new Error("curve fetch should not be used in Kyber warmup coverage test");
    },
    throttledMap: async <T, R>(items: T[], mapper: (item: T) => Promise<R>) => Promise.all(items.map(mapper)),
    polygonHubTokens: new Set([HUB_A, HUB_B]),
    hub4Tokens: new Set([HUB_A, HUB_B]),
    maxSyncWarmupPools: 2,
    maxSyncWarmupV3Pools: 2,
    maxSyncWarmupOneHubPools: 0,
    v2PollConcurrency: 1,
    v3PollConcurrency: 1,
    enrichConcurrency: 1,
  });

  coverageWarmup.seedStateCache();
  await coverageWarmup.warmupStateCache();

  assert.deepEqual(
    fetchedAddresses,
    [kyberPool.pool_address.toLowerCase()],
    "warmup should route KyberSwap Elastic pools through the V3 fetch path while skipping unsupported protocols",
  );
  assert.equal(
    logs.some(({ meta }) => meta?.event === "warmup_start" && meta?.unsupportedHubAdjacentPools === 1),
    true,
    "warmup should surface skipped unsupported hub-adjacent pools in structured startup telemetry",
  );
}

{
  const persistedStates = new Map<string, { block: number; data: Record<string, any> }>();
  let firstBootV3Fetches = 0;
  let resumedBootV3Fetches = 0;

  const activeV3Pool = {
    pool_address: V3_A,
    protocol: "UNISWAP_V3",
    status: "active",
    tokens: [HUB_A, HUB_B],
    metadata: {},
  };

  const createRegistry = () => ({
    getPools: () => [
      {
        ...activeV3Pool,
        state: persistedStates.get(activeV3Pool.pool_address.toLowerCase()) ?? null,
      },
    ],
    getActivePoolsMeta: () => [activeV3Pool],
    getCheckpoint: () => null,
    getGlobalCheckpoint: () => null,
    batchUpdateStates: (states: Array<{ pool_address: string; block: number; data: Record<string, any> }>) => {
      for (const state of states) {
        persistedStates.set(state.pool_address.toLowerCase(), {
          block: state.block,
          data: state.data,
        });
      }
    },
    disablePool: () => {},
  });

  const createV3Warmup = (stateCacheRef: Map<string, Record<string, any>>, onFetch: () => void) => createWarmupManager({
    getRegistry: createRegistry,
    stateCache: stateCacheRef,
    log: () => {},
    getPoolTokens: (entry: any) => entry.tokens,
    getPoolMetadata: (entry: any) => entry.metadata ?? {},
    validatePoolState,
    normalizePoolState: (_addr: string, protocol: string, tokens: string[], rawState: any) => ({
      poolId: activeV3Pool.pool_address.toLowerCase(),
      protocol,
      token0: tokens[0],
      token1: tokens[1],
      tokens,
      fee: 3000n,
      sqrtPriceX96: rawState.sqrtPriceX96,
      tick: rawState.tick,
      liquidity: rawState.liquidity,
      tickSpacing: rawState.tickSpacing,
      ticks: rawState.ticks,
      initialized: rawState.initialized,
      timestamp: rawState.fetchedAt,
    }),
    fetchMultipleV2States: async () => new Map(),
    fetchMultipleV3States: async (addresses: string[]) => {
      onFetch();
      const states = new Map<string, Record<string, any>>();
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
    fetchAndNormalizeBalancerPool: async () => {
      throw new Error("balancer fetch should not be used in checkpoint-less v3 persistence test");
    },
    fetchAndNormalizeCurvePool: async () => {
      throw new Error("curve fetch should not be used in checkpoint-less v3 persistence test");
    },
    throttledMap: async <T, R>(items: T[], mapper: (item: T) => Promise<R>) => Promise.all(items.map(mapper)),
    polygonHubTokens: new Set([HUB_A, HUB_B]),
    hub4Tokens: new Set([HUB_A, HUB_B]),
    maxSyncWarmupPools: 1,
    maxSyncWarmupV3Pools: 1,
    maxSyncWarmupOneHubPools: 0,
    v2PollConcurrency: 1,
    v3PollConcurrency: 1,
    enrichConcurrency: 1,
  });

  const firstBootCache = new Map<string, Record<string, any>>();
  const firstBootWarmup = createV3Warmup(firstBootCache, () => {
    firstBootV3Fetches += 1;
  });
  firstBootWarmup.seedStateCache();
  await firstBootWarmup.warmupStateCache();

  assert.equal(firstBootV3Fetches, 1, "checkpoint-less first boot should still fetch missing v3 state once");
  assert.equal(
    persistedStates.get(activeV3Pool.pool_address.toLowerCase())?.block,
    0,
    "checkpoint-less warmup should persist v3 state with a synthetic block so it can resume later",
  );

  const resumedCache = new Map<string, Record<string, any>>();
  const resumedWarmup = createV3Warmup(resumedCache, () => {
    resumedBootV3Fetches += 1;
  });
  resumedWarmup.seedStateCache();
  await resumedWarmup.warmupStateCache();

  assert.equal(resumedBootV3Fetches, 0, "persisted checkpoint-less v3 warmup state should resume without refetching");
  assert.equal(
    validatePoolState(resumedCache.get(activeV3Pool.pool_address.toLowerCase())).valid,
    true,
    "resumed checkpoint-less v3 state should remain routable after being reloaded from persistence",
  );
}

{
  const persistedStates = new Map<string, { block: number; data: Record<string, any> }>();
  let interruptedBootV3Fetches = 0;
  let resumedBootV3Fetches = 0;

  const activeV3Pool = {
    pool_address: V3_B,
    protocol: "UNISWAP_V3",
    status: "active",
    tokens: [HUB_A, HUB_B],
    metadata: {},
  };

  const createRegistry = () => ({
    getPools: () => [
      {
        ...activeV3Pool,
        state: persistedStates.get(activeV3Pool.pool_address.toLowerCase()) ?? null,
      },
    ],
    getActivePoolsMeta: () => [activeV3Pool],
    getCheckpoint: () => ({ last_block: 321 }),
    getGlobalCheckpoint: () => 321,
    batchUpdateStates: (states: Array<{ pool_address: string; block: number; data: Record<string, any> }>) => {
      for (const state of states) {
        persistedStates.set(state.pool_address.toLowerCase(), {
          block: state.block,
          data: state.data,
        });
      }
    },
    disablePool: () => {},
  });

  const createInterruptibleWarmup = (
    stateCacheRef: Map<string, Record<string, any>>,
    fetchMode: "interrupt" | "normal",
    onFetch: () => void,
  ) => createWarmupManager({
    getRegistry: createRegistry,
    stateCache: stateCacheRef,
    log: () => {},
    getPoolTokens: (entry: any) => entry.tokens,
    getPoolMetadata: (entry: any) => entry.metadata ?? {},
    validatePoolState,
    normalizePoolState: (_addr: string, protocol: string, tokens: string[], rawState: any) => ({
      poolId: activeV3Pool.pool_address.toLowerCase(),
      protocol,
      token0: tokens[0],
      token1: tokens[1],
      tokens,
      fee: 3000n,
      sqrtPriceX96: rawState.sqrtPriceX96,
      tick: rawState.tick,
      liquidity: rawState.liquidity,
      tickSpacing: rawState.tickSpacing,
      ticks: rawState.ticks,
      initialized: rawState.initialized,
      timestamp: rawState.fetchedAt,
    }),
    fetchMultipleV2States: async () => new Map(),
    fetchMultipleV3States: async (addresses: string[], _concurrency: number, _poolMeta: Map<any, any>, onProgress: any) => {
      onFetch();
      const address = addresses[0].toLowerCase();
      const rawState = {
        sqrtPriceX96: 1n << 96n,
        tick: 0,
        liquidity: 1000n,
        tickSpacing: 60,
        ticks: new Map(),
        initialized: true,
        fetchedAt: Date.now(),
      };
      onProgress?.(1, 1, address, rawState);
      if (fetchMode === "interrupt") {
        throw new Error("simulated restart during v3 warmup");
      }
      return new Map([[address, rawState]]);
    },
    fetchAndNormalizeBalancerPool: async () => {
      throw new Error("balancer fetch should not be used in interrupted v3 persistence test");
    },
    fetchAndNormalizeCurvePool: async () => {
      throw new Error("curve fetch should not be used in interrupted v3 persistence test");
    },
    throttledMap: async <T, R>(items: T[], mapper: (item: T) => Promise<R>) => Promise.all(items.map(mapper)),
    polygonHubTokens: new Set([HUB_A, HUB_B]),
    hub4Tokens: new Set([HUB_A, HUB_B]),
    maxSyncWarmupPools: 1,
    maxSyncWarmupV3Pools: 1,
    maxSyncWarmupOneHubPools: 0,
    v2PollConcurrency: 1,
    v3PollConcurrency: 1,
    enrichConcurrency: 1,
  });

  const interruptedCache = new Map<string, Record<string, any>>();
  const interruptedWarmup = createInterruptibleWarmup(interruptedCache, "interrupt", () => {
    interruptedBootV3Fetches += 1;
  });
  interruptedWarmup.seedStateCache();
  await assert.rejects(
    interruptedWarmup.warmupStateCache(),
    /simulated restart during v3 warmup/,
    "interrupted v3 warmup should surface the fetch failure",
  );

  assert.equal(
    persistedStates.get(activeV3Pool.pool_address.toLowerCase())?.block,
    321,
    "interrupted v3 warmup should persist partial results before the batch finishes",
  );

  const resumedCache = new Map<string, Record<string, any>>();
  const resumedWarmup = createInterruptibleWarmup(resumedCache, "normal", () => {
    resumedBootV3Fetches += 1;
  });
  resumedWarmup.seedStateCache();
  await resumedWarmup.warmupStateCache();

  assert.equal(
    resumedBootV3Fetches,
    0,
    "resumed boot should reuse partially persisted v3 warmup state instead of refetching",
  );
  assert.equal(
    validatePoolState(resumedCache.get(activeV3Pool.pool_address.toLowerCase())).valid,
    true,
    "partially persisted v3 warmup state should remain routable after restart",
  );
}

{
  const SATURATED_HUB_PAIR_A = "0x8888888888888888888888888888888888888881";
  const SATURATED_HUB_PAIR_B = "0x8888888888888888888888888888888888888882";
  const SATURATED_ONE_HUB = "0x8888888888888888888888888888888888888883";
  let saturatedBalancerFetches = 0;

  const additiveBudgetWarmup = createWarmupManager({
    getRegistry: () => ({
      getPools: () => [
        {
          pool_address: SATURATED_HUB_PAIR_A,
          protocol: "BALANCER_V2",
          status: "active",
          tokens: [HUB_A, HUB_B, NON_HUB],
          metadata: {},
        },
        {
          pool_address: SATURATED_HUB_PAIR_B,
          protocol: "BALANCER_V2",
          status: "active",
          tokens: [HUB_A, HUB_B, "0x9999999999999999999999999999999999999999"],
          metadata: {},
        },
        {
          pool_address: SATURATED_ONE_HUB,
          protocol: "BALANCER_V2",
          status: "active",
          tokens: [HUB_A, NON_HUB, "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],
          metadata: {},
        },
      ],
      getActivePoolsMeta() {
        return this.getPools();
      },
      getCheckpoint: () => ({ last_block: 123 }),
      getGlobalCheckpoint: () => 123,
      batchUpdateStates: () => {},
      disablePool: () => {},
    }),
    stateCache: new Map<string, Record<string, any>>(),
    log: () => {},
    getPoolTokens: (entry: any) => entry.tokens,
    getPoolMetadata: (entry: any) => entry.metadata ?? {},
    validatePoolState,
    normalizePoolState: (_addr: string, protocol: string, tokens: string[]) => ({
      poolId: "0xpool",
      protocol,
      token0: tokens[0],
      token1: tokens[1],
      tokens,
      fee: 3_000_000_000_000_000n,
      balances: [1_000n, 1_000n, 1_000n],
      weights: [333_333_333_333_333_333n, 333_333_333_333_333_333n, 333_333_333_333_333_334n],
      swapFee: 3_000_000_000_000_000n,
      timestamp: Date.now(),
    }),
    fetchMultipleV2States: async () => new Map(),
    fetchMultipleV3States: async () => new Map(),
    fetchAndNormalizeBalancerPool: async (entry: any) => {
      saturatedBalancerFetches += 1;
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
      throw new Error("curve fetch should not be used in additive warmup budget test");
    },
    throttledMap: async <T, R>(items: T[], mapper: (item: T) => Promise<R>) => Promise.all(items.map(mapper)),
    polygonHubTokens: new Set([HUB_A, HUB_B]),
    hub4Tokens: new Set([HUB_A, HUB_B]),
    maxSyncWarmupPools: 2,
    maxSyncWarmupV3Pools: 0,
    maxSyncWarmupOneHubPools: 1,
    v2PollConcurrency: 1,
    v3PollConcurrency: 1,
    enrichConcurrency: 1,
  });

  additiveBudgetWarmup.seedStateCache();
  await additiveBudgetWarmup.warmupStateCache();

  assert.equal(
    saturatedBalancerFetches,
    3,
    "warmup should apply the one-hub budget in addition to the saturated hub-pair budget",
  );
}

{
  const CORE_SIMPLE = "0x9999999999999999999999999999999999999991";
  const CORE_COMPLEX = "0x9999999999999999999999999999999999999992";
  const NON_CORE = "0x9999999999999999999999999999999999999993";
  let selectedAddresses: string[] = [];

  const prioritizationWarmup = createWarmupManager({
    getRegistry: () => ({
      getPools: () => [
        {
          pool_address: NON_CORE,
          protocol: "UNISWAP_V3",
          status: "active",
          tokens: [HUB_C, NON_HUB],
          metadata: { fee: 3000, tickSpacing: 60 },
        },
        {
          pool_address: CORE_COMPLEX,
          protocol: "UNISWAP_V3",
          status: "active",
          tokens: [HUB_A, NON_HUB, "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"],
          metadata: { fee: 3000 },
        },
        {
          pool_address: CORE_SIMPLE,
          protocol: "UNISWAP_V3",
          status: "active",
          tokens: [HUB_A, NON_HUB],
          metadata: { fee: 3000, tickSpacing: 60 },
        },
      ],
      getActivePoolsMeta() {
        return this.getPools();
      },
      getCheckpoint: () => ({ last_block: 123 }),
      getGlobalCheckpoint: () => 123,
      batchUpdateStates: () => {},
      disablePool: () => {},
    }),
    stateCache: new Map<string, Record<string, any>>(),
    log: () => {},
    getPoolTokens: (entry: any) => entry.tokens,
    getPoolMetadata: (entry: any) => entry.metadata ?? {},
    validatePoolState,
    normalizePoolState: (_addr: string, protocol: string, tokens: string[]) => ({
      poolId: "0xpool",
      protocol,
      token0: tokens[0],
      token1: tokens[1],
      tokens,
      fee: 3000n,
      sqrtPriceX96: 1n << 96n,
      tick: 0,
      liquidity: 1000n,
      tickSpacing: 60,
      ticks: new Map(),
      initialized: true,
      timestamp: Date.now(),
    }),
    fetchMultipleV2States: async () => new Map(),
    fetchMultipleV3States: async (addresses: string[]) => {
      selectedAddresses = addresses.map((address) => address.toLowerCase());
      const states = new Map<string, Record<string, any>>();
      for (const address of selectedAddresses) {
        states.set(address, {
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
    fetchAndNormalizeBalancerPool: async () => {
      throw new Error("balancer fetch should not be used in warmup prioritization test");
    },
    fetchAndNormalizeCurvePool: async () => {
      throw new Error("curve fetch should not be used in warmup prioritization test");
    },
    throttledMap: async <T, R>(items: T[], mapper: (item: T) => Promise<R>) => Promise.all(items.map(mapper)),
    polygonHubTokens: new Set([HUB_A, HUB_B, HUB_C]),
    hub4Tokens: new Set([HUB_A, HUB_B]),
    maxSyncWarmupPools: 0,
    maxSyncWarmupV3Pools: 1,
    maxSyncWarmupOneHubPools: 1,
    v2PollConcurrency: 1,
    v3PollConcurrency: 1,
    enrichConcurrency: 1,
  });

  prioritizationWarmup.seedStateCache();
  await prioritizationWarmup.warmupStateCache();

  assert.deepEqual(
    selectedAddresses,
    [CORE_SIMPLE.toLowerCase()],
    "warmup should prioritize simpler core-hub pools over non-core or more complex one-hub candidates",
  );
}

console.log("Warmup checks passed.");
