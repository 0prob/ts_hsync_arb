import assert from "node:assert/strict";

import { createWarmupManager } from "../src/bootstrap/warmup.ts";
import { normalizePoolState, normalizeV3State, validatePoolState } from "../src/state/normalizer.ts";
import { getPoolMetadata, getPoolTokens } from "../src/util/pool_record.ts";

const tokenA = "0x1111111111111111111111111111111111111111";
const tokenB = "0x2222222222222222222222222222222222222222";
const tokenC = "0x3333333333333333333333333333333333333333";
const observedV3Pool = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const missingV3Pool = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const zeroV2Pool = "0xcccccccccccccccccccccccccccccccccccccccc";

type Pool = {
  pool_address: string;
  protocol: string;
  tokens: string[];
  metadata?: Record<string, unknown>;
  status?: string;
};

function pool(pool_address: string, protocol: string, metadata: Record<string, unknown> = {}): Pool {
  return poolWithTokens(pool_address, protocol, [tokenA, tokenB], metadata);
}

function poolWithTokens(
  pool_address: string,
  protocol: string,
  tokens: string[],
  metadata: Record<string, unknown> = {},
): Pool {
  return {
    pool_address,
    protocol,
    tokens,
    metadata,
    status: "active",
  };
}

function validV3Raw(fetchedAt = 1) {
  return {
    fee: 3000n,
    sqrtPriceX96: 79228162514264337593543950336n,
    tick: 0,
    liquidity: 1_000_000n,
    tickSpacing: 60,
    ticks: new Map([[0, { liquidityGross: 1_000_000n, liquidityNet: 0n }]]),
    fetchedAt,
    initialized: true,
  };
}

function zeroLiquidityV3Raw(fetchedAt = 1) {
  return {
    ...validV3Raw(fetchedAt),
    liquidity: 0n,
    ticks: new Map(),
  };
}

function zeroReserveV2Raw(fetchedAt = 1) {
  return {
    reserve0: 0n,
    reserve1: 1_000_000n,
    blockTimestampLast: 1,
    fetchedAt,
  };
}

function createHarness(options: {
  pools: Pool[];
  stateCache?: Map<string, Record<string, any>>;
  maxSyncWarmupOneHubPools?: number;
  maxSyncWarmupOneHubV3Pools?: number;
  fetchV2?: (addresses: string[]) => Promise<any>;
  fetchV3?: (
    addresses: string[],
    onProgress: (completed: number, total: number, addr?: string, rawState?: unknown | null) => void,
    poolMeta: Map<string, Record<string, unknown>>,
  ) => Promise<any>;
}): {
  manager: ReturnType<typeof createWarmupManager>;
  logs: Array<{ message: string; level?: string; meta?: any }>;
  stateUpdates: Array<{ pool_address: string; block: number; data: any }>;
  stateCache: Map<string, Record<string, any>>;
} {
  const logs: Array<{ message: string; level?: string; meta?: any }> = [];
  const stateUpdates: Array<{ pool_address: string; block: number; data: any }> = [];
  const stateCache = options.stateCache ?? new Map<string, Record<string, any>>();
  const registry = {
    getActivePoolsMeta: () => options.pools,
    getPools: () => options.pools,
    getCheckpoint: () => null,
    getGlobalCheckpoint: () => 123,
    getTokenDecimals: (tokens: string[]) => new Map(tokens.map((token) => [token.toLowerCase(), 18])),
    batchUpdateStates: (states: Array<{ pool_address: string; block: number; data: any }>) => {
      stateUpdates.push(...states);
      return { updated: states.length, skipped: 0 };
    },
    disablePool: () => {},
  };

  const manager = createWarmupManager({
    getRegistry: () => registry,
    stateCache,
    log: (message, level, meta) => {
      logs.push({ message, level, meta });
    },
    getPoolTokens,
    getPoolMetadata,
    validatePoolState,
    normalizePoolState,
    fetchMultipleV2States: async (addresses) => {
      if (!options.fetchV2) throw new Error(`unexpected V2 fetch: ${addresses.join(",")}`);
      return options.fetchV2(addresses);
    },
    fetchMultipleV3States: async (addresses, _concurrency, poolMeta, onProgress) => {
      if (!options.fetchV3) throw new Error(`unexpected V3 fetch: ${addresses.join(",")}`);
      return options.fetchV3(addresses, onProgress, poolMeta);
    },
    fetchAndNormalizeBalancerPool: async () => {
      throw new Error("unexpected Balancer fetch");
    },
    fetchAndNormalizeCurvePool: async () => {
      throw new Error("unexpected Curve fetch");
    },
    fetchAndNormalizeDodoPool: async () => {
      throw new Error("unexpected DODO fetch");
    },
    fetchAndNormalizeWoofiPool: async () => {
      throw new Error("unexpected WOOFi fetch");
    },
    throttledMap: async (items, mapper) => Promise.all(items.map((item) => mapper(item))),
    polygonHubTokens: new Set([tokenA, tokenB]),
    hub4Tokens: new Set([tokenA, tokenB]),
    maxSyncWarmupPools: 10,
    maxSyncWarmupV3Pools: 10,
    maxSyncWarmupOneHubPools: options.maxSyncWarmupOneHubPools ?? 0,
    maxSyncWarmupOneHubV3Pools: options.maxSyncWarmupOneHubV3Pools ?? 0,
    v2PollConcurrency: 4,
    v3PollConcurrency: 4,
    enrichConcurrency: 4,
  });

  return { manager, logs, stateUpdates, stateCache };
}

{
  let v3FetchCalls = 0;
  const oneHubV3Pool = "0xdddddddddddddddddddddddddddddddddddddddd";
  const { manager, logs } = createHarness({
    pools: [
      poolWithTokens(oneHubV3Pool, "UNISWAP_V3", [tokenA, tokenC], {
        fee: "3000",
        tickSpacing: "60",
      }),
    ],
    maxSyncWarmupOneHubPools: 10,
    maxSyncWarmupOneHubV3Pools: 0,
    fetchV3: async () => {
      v3FetchCalls++;
      throw new Error("one-hub V3 should not run during startup warmup by default");
    },
  });

  await manager.warmupStateCache();

  assert.equal(v3FetchCalls, 0);
  assert.equal(
    logs.some((entry) => entry.meta?.event === "warmup_start"),
    false,
    "one-hub V3 backlog should not keep startup warmup running by default",
  );
}

{
  const observedState = normalizeV3State(
    observedV3Pool,
    "UNISWAP_V3",
    [tokenA, tokenB],
    zeroLiquidityV3Raw(10),
  );
  assert.equal(validatePoolState(observedState).reason, "V3: zero liquidity");

  const fetchedAddresses: string[] = [];
  const { manager, logs, stateCache } = createHarness({
    pools: [
      pool(observedV3Pool, "UNISWAP_V3"),
      pool(missingV3Pool, "UNISWAP_V3"),
    ],
    stateCache: new Map([[observedV3Pool, observedState]]),
    fetchV3: async (addresses, onProgress) => {
      const states = new Map() as any;
      states.noDataFailures = new Set<string>();
      let completed = 0;
      for (const addr of addresses) {
        fetchedAddresses.push(addr.toLowerCase());
        const raw = validV3Raw(20 + completed);
        states.set(addr.toLowerCase(), raw);
        completed++;
        onProgress(completed, addresses.length, addr, raw);
      }
      return states;
    },
  });

  await manager.warmupStateCache();

  assert.deepEqual(fetchedAddresses, [missingV3Pool]);
  assert.equal(
    validatePoolState(stateCache.get(observedV3Pool)).reason,
    "V3: zero liquidity",
    "observed inactive V3 state should remain cached but not re-fetched during startup warmup",
  );
  assert.equal(validatePoolState(stateCache.get(missingV3Pool)).valid, true);
  assert.equal(
    logs.find((entry) => entry.meta?.event === "warmup_start")?.meta?.observedUnroutablePools,
    1,
    "startup logs should expose observed unroutable pools skipped by warmup",
  );
}

{
  const kyberPool = "0xdddddddddddddddddddddddddddddddddddddddd";
  const capturedMeta: Array<Map<string, Record<string, unknown>>> = [];
  const { manager } = createHarness({
    pools: [
      pool(kyberPool, "KYBERSWAP_ELASTIC", {
        fee: "4000",
        swapFeeBps: "40",
        tickSpacing: "8",
        isKyberElastic: true,
      }),
    ],
    fetchV3: async (addresses, onProgress, poolMeta) => {
      capturedMeta.push(poolMeta);
      const states = new Map() as any;
      states.noDataFailures = new Set<string>();
      for (const addr of addresses) {
        const raw = {
          ...validV3Raw(50),
          fee: 4000n,
          swapFeeBps: 40n,
          isKyberElastic: true,
          tickSpacing: 8,
        };
        states.set(addr.toLowerCase(), raw);
        onProgress(1, addresses.length, addr, raw);
      }
      return states;
    },
  });

  await manager.fetchAndCacheStates([pool(kyberPool, "KYBERSWAP_ELASTIC", {
    fee: "4000",
    swapFeeBps: "40",
    tickSpacing: "8",
    isKyberElastic: true,
  })]);

  const kyberMeta = capturedMeta[0]?.get(kyberPool);
  assert.equal(kyberMeta?.isKyberElastic, true);
  assert.equal(kyberMeta?.swapFeeBps, "40");
}

{
  const { manager, stateUpdates, stateCache } = createHarness({
    pools: [pool(observedV3Pool, "UNISWAP_V3")],
    fetchV3: async (addresses, onProgress) => {
      const states = new Map() as any;
      states.noDataFailures = new Set<string>();
      let completed = 0;
      for (const addr of addresses) {
        const raw = zeroLiquidityV3Raw(30 + completed);
        states.set(addr.toLowerCase(), raw);
        completed++;
        onProgress(completed, addresses.length, addr, raw);
      }
      return states;
    },
  });

  const stats = await manager.fetchAndCacheStates([pool(observedV3Pool, "UNISWAP_V3")], {
    v3HydrationMode: "full",
  });

  assert.equal(stats.normalized, 1);
  assert.equal(stats.observedUnroutable, 1);
  assert.equal(validatePoolState(stateCache.get(observedV3Pool)).reason, "V3: zero liquidity");
  assert.ok(
    stateUpdates.some((update) => update.pool_address === observedV3Pool && update.data.liquidity === 0n),
    "warmup should persist fetched inactive V3 snapshots so restarts can skip them",
  );
}

{
  const { manager, stateUpdates, stateCache } = createHarness({
    pools: [pool(zeroV2Pool, "QUICKSWAP_V2")],
    fetchV2: async (addresses) => {
      const states = new Map() as any;
      states.noDataFailures = new Set<string>();
      for (const addr of addresses) {
        states.set(addr.toLowerCase(), zeroReserveV2Raw(40));
      }
      return states;
    },
  });

  const stats = await manager.fetchAndCacheStates([pool(zeroV2Pool, "QUICKSWAP_V2")]);

  assert.equal(stats.normalized, 1);
  assert.equal(stats.observedUnroutable, 1);
  assert.equal(validatePoolState(stateCache.get(zeroV2Pool)).reason, "V2: zero reserves");
  assert.ok(
    stateUpdates.some((update) => update.pool_address === zeroV2Pool && update.data.reserve0 === 0n),
    "warmup should persist fetched inactive V2 snapshots so restarts can skip them",
  );
}

console.log("Warmup checks passed.");
