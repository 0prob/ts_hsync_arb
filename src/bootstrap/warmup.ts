export type PoolRecord = {
  pool_address: string;
  protocol: string;
  tokens: unknown;
  metadata?: unknown;
  status?: string;
  state?: { data?: Record<string, unknown> };
};

type WarmupStats = {
  scheduled: number;
  fetched: number;
  normalized: number;
  disabled: number;
  failed: number;
  protocols: Record<string, {
    scheduled: number;
    fetched: number;
    normalized: number;
    disabled: number;
    failed: number;
  }>;
};

type WarmupGroupStats = WarmupStats["protocols"][string];
type WarmupGroupResult = {
  addr: string;
  raw?: unknown;
  normalized?: Record<string, unknown> | null;
  noDataFailures?: Set<string>;
};
type WarmupGroup = {
  key: keyof WarmupStats["protocols"];
  protocols: Set<string>;
  progressPhase?: string;
  fetch: (group: PoolRecord[], stats: WarmupStats) => Promise<WarmupGroupResult[]>;
};

type WarmupDeps = {
  getRegistry: () => any;
  stateCache: Map<string, Record<string, any>>;
  log: (msg: string, level?: "fatal" | "error" | "warn" | "info" | "debug" | "trace", meta?: any) => void;
  getPoolTokens: (pool: PoolRecord) => string[];
  getPoolMetadata: (pool: PoolRecord) => Record<string, any>;
  validatePoolState: (state: any) => { valid: boolean; reason?: string };
  normalizePoolState: (addr: string, protocol: string, tokens: string[], raw: unknown, metadata?: unknown) => Record<string, unknown> | null;
  fetchMultipleV2States: (addresses: string[], concurrency: number) => Promise<any>;
  fetchMultipleV3States: (addresses: string[], concurrency: number, poolMeta: Map<any, any>, onProgress: (completed: number, total: number) => void) => Promise<any>;
  fetchAndNormalizeBalancerPool: (pool: PoolRecord) => Promise<{ addr: string; normalized: Record<string, unknown> }>;
  fetchAndNormalizeCurvePool: (pool: PoolRecord) => Promise<{ addr: string; normalized: Record<string, unknown> }>;
  throttledMap: <T, R>(items: T[], mapper: (item: T) => Promise<R>, concurrency: number) => Promise<R[]>;
  polygonHubTokens: Set<string>;
  hub4Tokens: Set<string>;
  maxSyncWarmupPools: number;
  maxSyncWarmupV3Pools: number;
  v2PollConcurrency: number;
  v3PollConcurrency: number;
  enrichConcurrency: number;
};

const WARMUP_V2 = new Set(["QUICKSWAP_V2", "SUSHISWAP_V2", "UNISWAP_V2"]);
const WARMUP_V3 = new Set(["UNISWAP_V3", "QUICKSWAP_V3", "SUSHISWAP_V3"]);
const WARMUP_BAL = new Set(["BALANCER_WEIGHTED", "BALANCER_STABLE", "BALANCER_V2"]);
const WARMUP_CRV = new Set([
  "CURVE_STABLE", "CURVE_CRYPTO", "CURVE_MAIN", "CURVE_MAIN_REGISTRY",
  "CURVE_FACTORY_STABLE", "CURVE_FACTORY_CRYPTO",
  "CURVE_CRYPTO_FACTORY", "CURVE_STABLE_FACTORY",
  "CURVE_STABLESWAP_NG", "CURVE_TRICRYPTO_NG",
]);
const WARMUP_PROGRESS_LOG_EVERY = 25;
const EMPTY_PROTOCOL_STATS = { scheduled: 0, fetched: 0, normalized: 0, disabled: 0, failed: 0 };

export function createWarmupManager(deps: WarmupDeps) {
  function warmupProgressSnapshot(stats: WarmupStats) {
    const protocolStats = stats.protocols || {};
    return {
      scheduled: stats.scheduled,
      fetched: stats.fetched,
      normalized: stats.normalized,
      disabled: stats.disabled,
      failed: stats.failed,
      remaining: Math.max(0, stats.scheduled - (stats.normalized + stats.disabled + stats.failed)),
      protocols: Object.fromEntries(
        Object.entries(protocolStats).map(([name, protocol]) => [
          name,
          {
            scheduled: protocol.scheduled,
            fetched: protocol.fetched,
            normalized: protocol.normalized,
            disabled: protocol.disabled,
            failed: protocol.failed,
            remaining: Math.max(0, protocol.scheduled - (protocol.normalized + protocol.disabled + protocol.failed)),
          },
        ]),
      ),
    };
  }

  function logWarmupProgress(stats: WarmupStats, phase: string, meta: Record<string, unknown> = {}) {
    deps.log(`State warmup progress: ${phase}.`, "info", {
      event: "warmup_progress",
      phase,
      ...warmupProgressSnapshot(stats),
      ...(meta || {}),
    });
  }

  function resolveWarmupPersistBlock() {
    const registry = deps.getRegistry();
    const watcherCheckpoint = registry?.getCheckpoint("HYPERSYNC_WATCHER");
    const watcherBlock = Number(watcherCheckpoint?.last_block);
    if (Number.isFinite(watcherBlock) && watcherBlock >= 0) return watcherBlock;

    const globalCheckpoint = registry?.getGlobalCheckpoint();
    const globalBlock = Number(globalCheckpoint);
    if (Number.isFinite(globalBlock) && globalBlock >= 0) return globalBlock;

    return null;
  }

  function createWarmupStats(pools: PoolRecord[], groups: WarmupGroup[]): WarmupStats {
    return {
      scheduled: pools.length,
      fetched: 0,
      normalized: 0,
      disabled: 0,
      failed: 0,
      protocols: Object.fromEntries(
        groups.map((group) => [
          group.key,
          { ...EMPTY_PROTOCOL_STATS, scheduled: pools.filter((pool) => group.protocols.has(pool.protocol)).length },
        ]),
      ),
    } as WarmupStats;
  }

  function persistWarmupBatch(states: Array<{ pool_address: string; block: number; data: object }>, persistBlock: number | null) {
    if (persistBlock == null || states.length === 0) return;
    deps.getRegistry()?.batchUpdateStates(states);
  }

  function disableWarmupNoDataPools(
    pools: PoolRecord[],
    noDataFailures: Set<string> | undefined,
    sourceLabel: string,
    stats: WarmupStats,
    groupStats: WarmupGroupStats,
  ) {
    if (!(noDataFailures instanceof Set) || noDataFailures.size === 0) return;

    const registry = deps.getRegistry();
    for (const pool of pools) {
      const addr = pool.pool_address.toLowerCase();
      if (!noDataFailures.has(addr)) continue;

      registry?.disablePool(addr, `${sourceLabel}: readContract returned no data`);
      deps.stateCache.delete(addr);
      groupStats.disabled++;
      stats.disabled++;
      deps.log(`[warmup] Disabled ${addr} after permanent ${sourceLabel} failure.`, "warn", {
        event: "warmup_disable_pool",
        poolAddress: addr,
        source: sourceLabel,
        ...warmupProgressSnapshot(stats),
      });
    }
  }

  async function runWarmupGroup(pools: PoolRecord[], group: WarmupGroup, stats: WarmupStats, persistBlock: number | null) {
    if (!pools.length) return;

    const groupStats = stats.protocols[group.key];
    const persisted: Array<{ pool_address: string; block: number; data: object }> = [];
    const results = await group.fetch(pools, stats);
    const noDataFailures = new Set<string>();

    for (const result of results) {
      if (result.noDataFailures instanceof Set) {
        for (const addr of result.noDataFailures) noDataFailures.add(addr);
      }
      if (!result.raw || !result.normalized) continue;
      deps.stateCache.set(result.addr, result.normalized);
      if (persistBlock != null) {
        persisted.push({ pool_address: result.addr, block: persistBlock, data: result.normalized });
      }
      groupStats.fetched++;
      groupStats.normalized++;
      stats.fetched++;
      stats.normalized++;
    }

    const failedWithoutDisable = Math.max(0, groupStats.scheduled - (groupStats.normalized + noDataFailures.size));
    groupStats.failed += failedWithoutDisable;
    stats.failed += failedWithoutDisable;

    disableWarmupNoDataPools(pools, noDataFailures, `${String(group.key)} warmup`, stats, groupStats);
    persistWarmupBatch(persisted, persistBlock);

    if (group.progressPhase) {
      logWarmupProgress(stats, group.progressPhase, {
        protocol: group.key,
        completed: groupStats.normalized + groupStats.failed + groupStats.disabled,
        total: groupStats.scheduled,
      });
    }
  }

  async function fetchAndCacheStates(pools: PoolRecord[]) {
    if (!pools.length) {
      return {
        scheduled: 0,
        fetched: 0,
        normalized: 0,
        disabled: 0,
        failed: 0,
        protocols: {},
      };
    }

    const persistBlock = resolveWarmupPersistBlock();
    let stats!: WarmupStats;
    const groups: WarmupGroup[] = [
      {
        key: "v2",
        protocols: WARMUP_V2,
        progressPhase: "v2_complete",
        async fetch(group) {
          const statesMap = await deps.fetchMultipleV2States(group.map((pool) => pool.pool_address), deps.v2PollConcurrency);
          return group.map((pool) => {
            const addr = pool.pool_address.toLowerCase();
            const raw = statesMap.get(addr);
            const tokens = deps.getPoolTokens(pool);
            return {
              addr,
              raw,
              normalized: raw && tokens.length ? deps.normalizePoolState(addr, pool.protocol, tokens, raw, pool.metadata) : null,
              noDataFailures: statesMap?.noDataFailures,
            };
          });
        },
      },
      {
        key: "v3",
        protocols: WARMUP_V3,
        progressPhase: "v3_complete",
        async fetch(group) {
          const poolMeta = new Map();
          for (const pool of group) {
            const meta = deps.getPoolMetadata(pool);
            if (meta.isAlgebra) poolMeta.set(pool.pool_address.toLowerCase(), { isAlgebra: true });
          }
          let lastV3ProgressLogAt = 0;
          const statesMap = await deps.fetchMultipleV3States(
            group.map((pool) => pool.pool_address),
            deps.v3PollConcurrency,
            poolMeta,
            (completed: number, total: number) => {
              const now = Date.now();
              if (completed === total || completed % 10 === 0 || now - lastV3ProgressLogAt >= 5_000) {
                lastV3ProgressLogAt = now;
                deps.log(`State warmup progress: v3_progress (${completed}/${total}).`, "info", {
                  event: "warmup_progress",
                  phase: "v3_progress",
                  protocol: "v3",
                  completed,
                  total,
                  remaining: Math.max(0, total - completed),
                });
              }
            },
          );
          return group.map((pool) => {
            const addr = pool.pool_address.toLowerCase();
            const raw = statesMap.get(addr);
            const tokens = deps.getPoolTokens(pool);
            return {
              addr,
              raw,
              normalized: raw && tokens.length ? deps.normalizePoolState(addr, pool.protocol, tokens, raw, pool.metadata) : null,
              noDataFailures: statesMap?.noDataFailures,
            };
          });
        },
      },
      {
        key: "balancer",
        protocols: WARMUP_BAL,
        progressPhase: "balancer_progress",
        async fetch(group, stats) {
          let completed = 0;
          return deps.throttledMap(group, async (pool: PoolRecord) => {
            try {
              const { addr, normalized } = await deps.fetchAndNormalizeBalancerPool(pool);
              return { addr, raw: normalized, normalized };
            } catch {
              return { addr: pool.pool_address.toLowerCase(), raw: null, normalized: null };
            } finally {
              completed++;
              if (completed === group.length || completed % WARMUP_PROGRESS_LOG_EVERY === 0) {
                logWarmupProgress(stats, "balancer_progress", { protocol: "balancer", completed, total: group.length });
              }
            }
          }, deps.enrichConcurrency);
        },
      },
      {
        key: "curve",
        protocols: WARMUP_CRV,
        progressPhase: "curve_progress",
        async fetch(group, stats) {
          let completed = 0;
          return deps.throttledMap(group, async (pool: PoolRecord) => {
            try {
              const { addr, normalized } = await deps.fetchAndNormalizeCurvePool(pool);
              return { addr, raw: normalized, normalized };
            } catch {
              return { addr: pool.pool_address.toLowerCase(), raw: null, normalized: null };
            } finally {
              completed++;
              if (completed === group.length || completed % WARMUP_PROGRESS_LOG_EVERY === 0) {
                logWarmupProgress(stats, "curve_progress", { protocol: "curve", completed, total: group.length });
              }
            }
          }, deps.enrichConcurrency);
        },
      },
    ];

    stats = createWarmupStats(pools, groups);
    logWarmupProgress(stats, "rpc_fetch_started");
    await Promise.all(groups.map((group) => {
      const groupPools = pools.filter((pool) => group.protocols.has(pool.protocol));
      return runWarmupGroup(groupPools, group, stats, persistBlock);
    }));
    return stats;
  }

  function poolBothTokensAreHubs(pool: PoolRecord, hubTokens: Set<string>) {
    const tokens = deps.getPoolTokens(pool);
    if (!tokens || tokens.length < 2) return false;
    return hubTokens.has(tokens[0]) && hubTokens.has(tokens[1]);
  }

  function warmupPriority(pool: PoolRecord) {
    const tokens = deps.getPoolTokens(pool);
    const bothCoreHubs = tokens.length >= 2 && deps.hub4Tokens.has(tokens[0]) && deps.hub4Tokens.has(tokens[1]);

    let protocolRank = 3;
    if (WARMUP_V2.has(pool.protocol)) protocolRank = 0;
    else if (WARMUP_V3.has(pool.protocol)) protocolRank = 1;
    else if (WARMUP_BAL.has(pool.protocol)) protocolRank = 2;

    return [bothCoreHubs ? 0 : 1, protocolRank, pool.pool_address.toLowerCase()];
  }

  function compareWarmupPriority(a: PoolRecord, b: PoolRecord) {
    const left = warmupPriority(a);
    const right = warmupPriority(b);
    for (let i = 0; i < left.length; i++) {
      if (left[i] < right[i]) return -1;
      if (left[i] > right[i]) return 1;
    }
    return 0;
  }

  function seedStateCache() {
    const pools = deps.getRegistry()?.getPools({ status: "active" }) ?? [];
    let withState = 0;

    for (const pool of pools) {
      const addr = pool.pool_address.toLowerCase();
      if (pool.state?.data) {
        deps.stateCache.set(addr, pool.state.data);
        withState++;
      } else {
        deps.stateCache.set(addr, {
          poolId: addr,
          protocol: pool.protocol,
          tokens: deps.getPoolTokens(pool),
          timestamp: 0,
        });
      }
    }

    deps.log(`Seeded stateCache: ${withState} pools with persisted state, ${pools.length - withState} empty (${pools.length} total)`, "info", {
      event: "seed_state_cache",
      activePools: pools.length,
      persistedPools: withState,
      emptyPools: pools.length - withState,
    });
  }

  async function warmupStateCache() {
    const activePools = deps.getRegistry()?.getActivePoolsMeta() ?? [];
    const needsState = activePools.filter((p: PoolRecord) => !deps.validatePoolState(deps.stateCache.get(p.pool_address.toLowerCase())).valid);

    if (needsState.length === 0) {
      deps.log("State cache already warm — skipping warmup.", "info", {
        event: "warmup_skip",
        reason: "state_cache_already_warm",
      });
      return;
    }

    const hubPairPools = needsState.filter((p: PoolRecord) => poolBothTokensAreHubs(p, deps.polygonHubTokens));
    if (hubPairPools.length === 0) {
      deps.log("State warmup: no hub-pair pools without state — watcher will populate the rest.", "info", {
        event: "warmup_skip",
        reason: "no_hub_pair_pools_without_state",
        needsState: needsState.length,
      });
      return;
    }

    const prioritizedHubPairPools = [...hubPairPools].sort(compareWarmupPriority);
    const uncappedSyncWarmupPools = prioritizedHubPairPools.slice(0, deps.maxSyncWarmupPools);
    const syncWarmupPools = [];
    let syncWarmupV3Pools = 0;

    for (const pool of uncappedSyncWarmupPools) {
      if (WARMUP_V3.has(pool.protocol)) {
        if (syncWarmupV3Pools >= deps.maxSyncWarmupV3Pools) continue;
        syncWarmupV3Pools++;
      }
      syncWarmupPools.push(pool);
    }

    const deferredPools = hubPairPools.length - syncWarmupPools.length;
    const deferredV3Pools = uncappedSyncWarmupPools.filter((pool) => WARMUP_V3.has(pool.protocol)).length - syncWarmupV3Pools;

    if (syncWarmupPools.length === 0) {
      deps.log("State warmup: synchronous warmup budget is 0 — watcher will populate hub pairs.", "info", {
        event: "warmup_skip",
        reason: "sync_warmup_budget_zero",
        hubPairPools: hubPairPools.length,
      });
      return;
    }

    deps.log(`State warmup: fetching ${syncWarmupPools.length}/${hubPairPools.length} hub-pair pools via RPC (sync)...`, "info", {
      event: "warmup_start",
      needsState: needsState.length,
      hubPairPools: hubPairPools.length,
      syncWarmupPools: syncWarmupPools.length,
      deferredPools,
      deferredV3Pools,
      maxSyncWarmupPools: deps.maxSyncWarmupPools,
      maxSyncWarmupV3Pools: deps.maxSyncWarmupV3Pools,
      protocolBreakdown: {
        v2: syncWarmupPools.filter((pool) => WARMUP_V2.has(pool.protocol)).length,
        v3: syncWarmupPools.filter((pool) => WARMUP_V3.has(pool.protocol)).length,
        balancer: syncWarmupPools.filter((pool) => WARMUP_BAL.has(pool.protocol)).length,
        curve: syncWarmupPools.filter((pool) => WARMUP_CRV.has(pool.protocol)).length,
      },
    });

    const warmupStats = await fetchAndCacheStates(syncWarmupPools);
    const valid = syncWarmupPools.filter((p) => deps.validatePoolState(deps.stateCache.get(p.pool_address.toLowerCase())).valid).length;
    deps.log(`State warmup complete: ${valid}/${syncWarmupPools.length} sync hub-pair pools routable.`, "info", {
      event: "warmup_complete",
      hubPairPools: hubPairPools.length,
      syncWarmupPools: syncWarmupPools.length,
      deferredPools,
      deferredV3Pools,
      routablePools: valid,
      unroutablePools: syncWarmupPools.length - valid,
      warmupStats,
    });
  }

  return {
    fetchAndCacheStates,
    seedStateCache,
    warmupStateCache,
  };
}
