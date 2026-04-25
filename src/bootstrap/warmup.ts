import { takeTopNBy } from "../util/bounded_priority.ts";
import { metadataWithRegistryTokenDecimals } from "../state/pool_metadata.ts";
import {
  BALANCER_PROTOCOLS,
  CURVE_PROTOCOLS,
  normalizeProtocolKey,
  V2_PROTOCOLS,
  V3_PROTOCOLS,
} from "../protocols/classification.ts";

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
type FetchAndCacheOptions = {
  v3HydrationMode?: "full" | "nearby" | "none" | "tiered";
  v3NearWordRadius?: number;
  logContext?: FetchLogContext;
};
type FetchLogContext = {
  label: string;
  eventPrefix: string;
};
type V3FetchOptions = {
  hydrationMode?: "full" | "nearby" | "none";
  nearWordRadius?: number;
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
  fetchMultipleV3States: (
    addresses: string[],
    concurrency: number,
    poolMeta: Map<any, any>,
    onProgress: (completed: number, total: number, addr?: string, rawState?: unknown | null) => void,
    fetchOptions?: V3FetchOptions,
  ) => Promise<any>;
  fetchAndNormalizeBalancerPool: (pool: PoolRecord) => Promise<{ addr: string; normalized: Record<string, unknown> }>;
  fetchAndNormalizeCurvePool: (pool: PoolRecord) => Promise<{ addr: string; normalized: Record<string, unknown> }>;
  throttledMap: <T, R>(items: T[], mapper: (item: T) => Promise<R>, concurrency: number) => Promise<R[]>;
  polygonHubTokens: Set<string>;
  hub4Tokens: Set<string>;
  maxSyncWarmupPools: number;
  maxSyncWarmupV3Pools: number;
  maxSyncWarmupOneHubPools: number;
  v2PollConcurrency: number;
  v3PollConcurrency: number;
  enrichConcurrency: number;
};

const WARMUP_V2 = V2_PROTOCOLS;
const WARMUP_V3 = V3_PROTOCOLS;
const WARMUP_BAL = BALANCER_PROTOCOLS;
const WARMUP_CRV = CURVE_PROTOCOLS;
const SUPPORTED_WARMUP_PROTOCOLS = new Set([...WARMUP_V2, ...WARMUP_V3, ...WARMUP_BAL, ...WARMUP_CRV]);
const WARMUP_PROGRESS_LOG_EVERY = 25;
const EMPTY_PROTOCOL_STATS = { scheduled: 0, fetched: 0, normalized: 0, disabled: 0, failed: 0 };

export function isSupportedWarmupProtocol(protocol: string | null | undefined) {
  return SUPPORTED_WARMUP_PROTOCOLS.has(normalizeProtocolKey(protocol));
}

export function createWarmupManager(deps: WarmupDeps) {
  function resolveFetchLogContext(options: FetchAndCacheOptions): FetchLogContext {
    return options.logContext ?? {
      label: "State warmup",
      eventPrefix: "warmup",
    };
  }

  function eventName(logContext: FetchLogContext, suffix: string) {
    return `${logContext.eventPrefix}_${suffix}`;
  }

  function effectiveSyncWarmupV3FullBudget() {
    const cappedByTotalWarmup = Math.min(
      deps.maxSyncWarmupV3Pools,
      deps.maxSyncWarmupPools + deps.maxSyncWarmupOneHubPools,
    );
    return Math.max(0, cappedByTotalWarmup);
  }

  function isAlgebraPool(pool: any) {
    const metadata = deps.getPoolMetadata(pool);
    return pool?.protocol === "QUICKSWAP_V3" || pool?.protocol === "KYBERSWAP_ELASTIC" || metadata?.isAlgebra === true || metadata?.isKyberElastic === true;
  }

  function getPoolMetadataWithDecimals(pool: PoolRecord, tokens: string[]) {
    return metadataWithRegistryTokenDecimals(deps.getRegistry(), pool, tokens);
  }

  function supportsWarmupProtocol(pool: PoolRecord | null | undefined) {
    return isSupportedWarmupProtocol(pool?.protocol);
  }

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

  function logWarmupProgress(
    stats: WarmupStats,
    phase: string,
    logContext: FetchLogContext,
    meta: Record<string, unknown> = {},
  ) {
    deps.log(`${logContext.label} progress: ${phase}.`, "info", {
      event: eventName(logContext, "progress"),
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

    // Discovery can fail before any checkpoint exists, but the fetched warmup
    // snapshot is still useful to resume from on the next boot.
    return 0;
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
          { ...EMPTY_PROTOCOL_STATS, scheduled: pools.filter((pool) => group.protocols.has(normalizeProtocolKey(pool.protocol))).length },
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
    logContext: FetchLogContext,
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
      deps.log(`[${logContext.eventPrefix}] Disabled ${addr} after permanent ${sourceLabel} failure.`, "warn", {
        event: eventName(logContext, "disable_pool"),
        poolAddress: addr,
        source: sourceLabel,
        ...warmupProgressSnapshot(stats),
      });
    }
  }

  async function runWarmupGroup(
    pools: PoolRecord[],
    group: WarmupGroup,
    stats: WarmupStats,
    persistBlock: number | null,
    logContext: FetchLogContext,
  ) {
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

    disableWarmupNoDataPools(
      pools,
      noDataFailures,
      `${String(group.key)} ${logContext.label.toLowerCase()}`,
      logContext,
      stats,
      groupStats,
    );
    persistWarmupBatch(persisted, persistBlock);

    if (group.progressPhase) {
      logWarmupProgress(stats, group.progressPhase, logContext, {
        protocol: group.key,
        completed: groupStats.normalized + groupStats.failed + groupStats.disabled,
        total: groupStats.scheduled,
      });
    }
  }

  async function fetchAndCacheStates(pools: PoolRecord[], options: FetchAndCacheOptions = {}) {
    const logContext = resolveFetchLogContext(options);
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

    const supportedPools = pools.filter((pool) => supportsWarmupProtocol(pool));
    const unsupportedProtocols = [...new Set(
      pools
        .filter((pool) => !supportsWarmupProtocol(pool))
        .map((pool) => String(pool.protocol || "unknown")),
    )].sort();
    if (unsupportedProtocols.length > 0) {
      deps.log(`${logContext.label}: skipping unsupported protocols in RPC batch.`, "info", {
        event: eventName(logContext, "skip_unsupported_protocols"),
        skippedPools: pools.length - supportedPools.length,
        unsupportedProtocols,
      });
    }
    if (!supportedPools.length) {
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
              normalized: raw && tokens.length ? deps.normalizePoolState(addr, normalizeProtocolKey(pool.protocol), tokens, raw, getPoolMetadataWithDecimals(pool, tokens)) : null,
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
          const poolByAddress = new Map<string, PoolRecord>();
          for (const pool of group) {
            poolByAddress.set(pool.pool_address.toLowerCase(), pool);
            if (isAlgebraPool(pool)) {
              const metadata = deps.getPoolMetadata(pool);
              poolMeta.set(pool.pool_address.toLowerCase(), {
                isAlgebra: true,
                isKyberElastic: normalizeProtocolKey(pool.protocol) === "KYBERSWAP_ELASTIC" || metadata?.isKyberElastic === true,
              });
            }
          }
          let lastV3ProgressLogAt = 0;
          const hydrationMode = options.v3HydrationMode ?? "tiered";
          const fullHydrationBudget = effectiveSyncWarmupV3FullBudget();
          const persistPartialV3State = (addr: string, rawState: unknown | null | undefined) => {
            if (!rawState) return;
            const normalizedAddr = addr.toLowerCase();
            const pool = poolByAddress.get(normalizedAddr);
            if (!pool) return;
            const tokens = deps.getPoolTokens(pool);
            if (!tokens.length) return;
            const normalized = deps.normalizePoolState(normalizedAddr, normalizeProtocolKey(pool.protocol), tokens, rawState, getPoolMetadataWithDecimals(pool, tokens));
            if (!normalized) return;
            deps.stateCache.set(normalizedAddr, normalized);
            if (persistBlock != null) {
              persistWarmupBatch([{ pool_address: normalizedAddr, block: persistBlock, data: normalized }], persistBlock);
            }
          };
          const progress = (completed: number, total: number, addr?: string, rawState?: unknown | null) => {
            if (addr) persistPartialV3State(addr, rawState);
            const now = Date.now();
            if (completed === total || completed % 10 === 0 || now - lastV3ProgressLogAt >= 5_000) {
              lastV3ProgressLogAt = now;
              deps.log(`${logContext.label} progress: v3_progress (${completed}/${total}).`, "info", {
                event: eventName(logContext, "progress"),
                phase: "v3_progress",
                protocol: "v3",
                completed,
                total,
                remaining: Math.max(0, total - completed),
              });
            }
          };
          const statesMap = new Map() as any;

          if (hydrationMode === "tiered") {
            const fullPools = group.slice(0, fullHydrationBudget);
            const nearbyPools = group.slice(fullHydrationBudget);
            const noDataFailures = new Set<string>();
            let completed = 0;
            const total = group.length;

            for (const [batchPools, batchMode] of [
              [fullPools, "full"],
              [nearbyPools, "nearby"],
            ] as const) {
              if (batchPools.length === 0) continue;
              const batchStates = await deps.fetchMultipleV3States(
                batchPools.map((pool) => pool.pool_address),
                deps.v3PollConcurrency,
                poolMeta,
                (batchCompleted: number, batchTotal: number, addr?: string, rawState?: unknown | null) => {
                  progress(completed + batchCompleted, total, addr, rawState);
                  if (batchCompleted === batchTotal) completed += batchTotal;
                },
                {
                  hydrationMode: batchMode,
                  nearWordRadius: options.v3NearWordRadius,
                },
              );
              for (const [addr, state] of batchStates.entries()) statesMap.set(addr, state);
              if (batchStates.noDataFailures instanceof Set) {
                for (const addr of batchStates.noDataFailures) noDataFailures.add(addr);
              }
            }
            statesMap.noDataFailures = noDataFailures;
          } else {
            const batchStates = await deps.fetchMultipleV3States(
              group.map((pool) => pool.pool_address),
              deps.v3PollConcurrency,
              poolMeta,
              progress,
              {
                hydrationMode,
                nearWordRadius: options.v3NearWordRadius,
              },
            );
            for (const [addr, state] of batchStates.entries()) statesMap.set(addr, state);
            statesMap.noDataFailures = batchStates.noDataFailures;
          }
          return group.map((pool) => {
            const addr = pool.pool_address.toLowerCase();
            const raw = statesMap.get(addr);
            const tokens = deps.getPoolTokens(pool);
            return {
              addr,
              raw,
              normalized: raw && tokens.length ? deps.normalizePoolState(addr, normalizeProtocolKey(pool.protocol), tokens, raw, getPoolMetadataWithDecimals(pool, tokens)) : null,
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
                logWarmupProgress(stats, "balancer_progress", logContext, {
                  protocol: "balancer",
                  completed,
                  total: group.length,
                });
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
                logWarmupProgress(stats, "curve_progress", logContext, {
                  protocol: "curve",
                  completed,
                  total: group.length,
                });
              }
            }
          }, deps.enrichConcurrency);
        },
      },
    ];

    stats = createWarmupStats(supportedPools, groups);
    logWarmupProgress(stats, "rpc_fetch_started", logContext);
    await Promise.all(groups.map((group) => {
      const groupPools = supportedPools.filter((pool) => group.protocols.has(normalizeProtocolKey(pool.protocol)));
      return runWarmupGroup(groupPools, group, stats, persistBlock, logContext);
    }));
    return stats;
  }

  function poolBothTokensAreHubs(pool: PoolRecord, hubTokens: Set<string>) {
    const tokens = deps.getPoolTokens(pool);
    if (!tokens || tokens.length < 2) return false;
    let hubMatches = 0;
    for (const token of tokens) {
      if (!hubTokens.has(token)) continue;
      hubMatches++;
      if (hubMatches >= 2) return true;
    }
    return false;
  }

  function poolTouchesAnyHub(pool: PoolRecord, hubTokens: Set<string>) {
    const tokens = deps.getPoolTokens(pool);
    if (!tokens || tokens.length === 0) return false;
    return tokens.some((token) => hubTokens.has(token));
  }

  function warmupPriority(pool: PoolRecord) {
    const tokens = deps.getPoolTokens(pool);
    let coreHubMatches = 0;
    let totalHubMatches = 0;
    for (const token of tokens) {
      if (deps.polygonHubTokens.has(token)) totalHubMatches++;
      if (deps.hub4Tokens.has(token)) coreHubMatches++;
    }
    const bothCoreHubs = coreHubMatches >= 2;
    const tokenCount = tokens.length > 0 ? tokens.length : Number.MAX_SAFE_INTEGER;
    const metadata = deps.getPoolMetadata(pool);
    const protocol = normalizeProtocolKey(pool.protocol);

    let protocolRank = 3;
    if (WARMUP_V2.has(protocol)) protocolRank = 0;
    else if (WARMUP_V3.has(protocol)) protocolRank = 1;
    else if (WARMUP_BAL.has(protocol)) protocolRank = 2;

    let metadataReadiness = 0;
    if (WARMUP_V2.has(protocol)) {
      if (metadata.feeNumerator != null || metadata.fee != null) metadataReadiness += 1;
    } else if (WARMUP_V3.has(protocol)) {
      if (metadata.fee != null) metadataReadiness += 2;
      if (metadata.tickSpacing != null) metadataReadiness += 1;
      if (metadata.isAlgebra === true) metadataReadiness += 1;
    } else if (WARMUP_BAL.has(protocol)) {
      if (metadata.poolId != null || metadata.pool_id != null) metadataReadiness += 2;
    } else if (WARMUP_CRV.has(protocol)) {
      if (metadata.coins != null || metadata.nCoins != null) metadataReadiness += 1;
    }

    return [
      bothCoreHubs ? 0 : 1,
      -Math.min(coreHubMatches, 4),
      -Math.min(totalHubMatches, 8),
      tokenCount,
      -metadataReadiness,
      protocolRank,
      pool.pool_address.toLowerCase(),
    ];
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
    const supportedNeedsState = needsState.filter((pool: PoolRecord) => supportsWarmupProtocol(pool));
    const unsupportedHubAdjacentPools = needsState.filter((pool: PoolRecord) =>
      !supportsWarmupProtocol(pool) && poolTouchesAnyHub(pool, deps.polygonHubTokens)
    );

    if (needsState.length === 0) {
      deps.log("State cache already warm — skipping warmup.", "info", {
        event: "warmup_skip",
        reason: "state_cache_already_warm",
      });
      return;
    }

    const hubPairPools = supportedNeedsState.filter((p: PoolRecord) => poolBothTokensAreHubs(p, deps.polygonHubTokens));
    const oneHubPools = supportedNeedsState.filter((p: PoolRecord) =>
      !poolBothTokensAreHubs(p, deps.polygonHubTokens) && poolTouchesAnyHub(p, deps.polygonHubTokens)
    );
    if (hubPairPools.length === 0 && oneHubPools.length === 0) {
      deps.log("State warmup: no hub-adjacent pools without state — watcher will populate the rest.", "info", {
        event: "warmup_skip",
        reason: unsupportedHubAdjacentPools.length > 0
          ? "no_supported_hub_adjacent_pools_without_state"
          : "no_hub_adjacent_pools_without_state",
        needsState: needsState.length,
        supportedNeedsState: supportedNeedsState.length,
        unsupportedHubAdjacentPools: unsupportedHubAdjacentPools.length,
      });
      return;
    }

    const prioritizedHubPairPools = takeTopNBy(hubPairPools, deps.maxSyncWarmupPools, compareWarmupPriority);
    const secondaryWarmupBudget = Math.max(0, deps.maxSyncWarmupOneHubPools);
    const prioritizedOneHubPools = takeTopNBy(oneHubPools, secondaryWarmupBudget, compareWarmupPriority);
    const syncWarmupPools = [];

    for (const pool of prioritizedHubPairPools) {
      syncWarmupPools.push(pool);
    }

    let secondaryWarmupPools = 0;
    for (const pool of prioritizedOneHubPools) {
      if (secondaryWarmupPools >= secondaryWarmupBudget) break;
      syncWarmupPools.push(pool);
      secondaryWarmupPools++;
    }

    const targetedPools = hubPairPools.length + oneHubPools.length;
    const deferredPools = targetedPools - syncWarmupPools.length;

    if (syncWarmupPools.length === 0) {
      deps.log("State warmup: synchronous warmup budget is 0 — watcher will populate hub-adjacent pools.", "info", {
        event: "warmup_skip",
        reason: "sync_warmup_budget_zero",
        hubPairPools: hubPairPools.length,
        oneHubPools: oneHubPools.length,
      });
      return;
    }

    let v2Count = 0;
    let v3Count = 0;
    let balancerCount = 0;
    let curveCount = 0;
    for (const pool of syncWarmupPools) {
      const protocol = normalizeProtocolKey(pool.protocol);
      if (WARMUP_V2.has(protocol)) v2Count++;
      else if (WARMUP_V3.has(protocol)) v3Count++;
      else if (WARMUP_BAL.has(protocol)) balancerCount++;
      else if (WARMUP_CRV.has(protocol)) curveCount++;
    }

    deps.log(`State warmup: fetching ${syncWarmupPools.length}/${targetedPools} hub-adjacent pools via RPC (sync)...`, "info", {
      event: "warmup_start",
      needsState: needsState.length,
      supportedNeedsState: supportedNeedsState.length,
      unsupportedHubAdjacentPools: unsupportedHubAdjacentPools.length,
      hubPairPools: hubPairPools.length,
      oneHubPools: oneHubPools.length,
      syncWarmupPools: syncWarmupPools.length,
      secondaryWarmupPools,
      deferredPools,
      maxSyncWarmupPools: deps.maxSyncWarmupPools,
      maxSyncWarmupV3Pools: deps.maxSyncWarmupV3Pools,
      effectiveSyncWarmupV3FullBudget: effectiveSyncWarmupV3FullBudget(),
      maxSyncWarmupOneHubPools: deps.maxSyncWarmupOneHubPools,
      protocolBreakdown: {
        v2: v2Count,
        v3: v3Count,
        balancer: balancerCount,
        curve: curveCount,
      },
    });

    const warmupStats = await fetchAndCacheStates(syncWarmupPools);
    let valid = 0;
    for (const pool of syncWarmupPools) {
      if (deps.validatePoolState(deps.stateCache.get(pool.pool_address.toLowerCase())).valid) {
        valid++;
      }
    }
    deps.log(`State warmup complete: ${valid}/${syncWarmupPools.length} sync hub-adjacent pools routable.`, "info", {
      event: "warmup_complete",
      supportedNeedsState: supportedNeedsState.length,
      unsupportedHubAdjacentPools: unsupportedHubAdjacentPools.length,
      hubPairPools: hubPairPools.length,
      oneHubPools: oneHubPools.length,
      syncWarmupPools: syncWarmupPools.length,
      secondaryWarmupPools,
      deferredPools,
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
