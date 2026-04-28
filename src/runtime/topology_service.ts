import { toFiniteNumber as normaliseLogWeight } from "../util/bigint.ts";
import { createTopologyCache } from "../arb/topology_cache.ts";
import type { ArbPathLike } from "../arb/assessment.ts";
import { getPoolTokens, normalizeEvmAddress } from "../util/pool_record.ts";
import { poolLiquidityWmatic } from "../routing/liquidity.ts";
import { routeIdentityFromEdges } from "../routing/route_identity.ts";
import type { RouteCache } from "../routing/route_cache.ts";
import type { RoutingGraph } from "../routing/graph.ts";
import { takeTopNBy } from "../util/bounded_priority.ts";

type LogLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace";
type LoggerFn = (msg: string, level?: LogLevel, meta?: unknown) => void;
type PoolState = Record<string, any>;
type StateCache = Map<string, PoolState>;
type PoolRecord = {
  pool_address: string;
  protocol: string;
  status?: string;
  tokens?: unknown;
};
type SwapEdge = {
  poolAddress: string;
  tokenIn: string;
  tokenOut: string;
  zeroForOne: boolean;
  stateRef?: {
    reserve0?: bigint;
    reserve1?: bigint;
  };
};
type RoutingGraphLike = Pick<RoutingGraph, "hasToken" | "getEdges" | "addPool" | "upsertPool" | "removePool" | "getPoolEdge"> & {
  _edgesByPool: Map<string, SwapEdge[]>;
};
type SerializedTopology = Record<string, Array<Record<string, unknown>>>;
type WorkerEnumerator = {
  enumerate: (
    topology: SerializedTopology,
    startTokens: string[],
    options: Record<string, unknown>,
  ) => Promise<unknown[]>;
};
type RegistryAdapter = {
  getActivePoolsMeta: () => PoolRecord[];
  getPoolMeta: (address: string) => PoolRecord | undefined;
};

type TopologyServiceDeps = {
  routingCycleMode: "all" | "triangular";
  routingMaxHops: number;
  maxTotalPaths: number;
  polygonHubTokens: Set<string>;
  hub4Tokens: Set<string>;
  selective4HopTokenLimit: number;
  dynamicPivotTokenLimit?: number;
  routeCycleCacheFile?: string | null;
  workerCount: number;
  workerPool: WorkerEnumerator;
  isWorkerPoolInitialized: () => boolean;
  cycleRefreshIntervalMs: number;
  routeCache: Pick<RouteCache, "prune" | "routes">;
  stateCache: StateCache;
  registry: RegistryAdapter;
  buildGraph: (pools: PoolRecord[], stateCache: StateCache) => RoutingGraphLike;
  buildHubGraph: (pools: PoolRecord[], hubTokens: Set<string>, stateCache: StateCache) => RoutingGraphLike;
  serializeTopology: (graph: RoutingGraphLike) => SerializedTopology;
  enumerateCycles: (graph: RoutingGraphLike, options: Record<string, unknown>) => ArbPathLike[];
  enumerateCyclesDual: (hubGraph: RoutingGraphLike, fullGraph: RoutingGraphLike, options: Record<string, unknown>) => ArbPathLike[];
  validatePoolState: (state: PoolState | undefined) => { valid: boolean; reason?: string };
  clearGasEstimateCache: () => void;
  log: LoggerFn;
};

export function createTopologyService(deps: TopologyServiceDeps) {
  const topologyCache = createTopologyCache(deps.maxTotalPaths);

  let hubGraph: RoutingGraphLike | null = null;
  let fullGraph: RoutingGraphLike | null = null;
  let cachedCycles: ArbPathLike[] = [];
  let topologyVersion = 0;
  let topologyDirty = true;
  let lastCycleRefreshMs = 0;
  let cycleRefreshPromise: Promise<ArbPathLike[]> | null = null;
  let queuedRefreshPromise: Promise<ArbPathLike[]> | null = null;
  let queuedRefreshForce = false;
  let dirtyPoolAddresses = new Set<string>();
  let dirtyHubStartTokens = new Set<string>();

  function cycleModeOptions(include4Hop: boolean) {
    if (deps.routingCycleMode === "triangular") {
      return {
        include2Hop: false,
        include3Hop: true,
        include4Hop: false,
        maxHops: 3,
      };
    }

    return {
      include2Hop: deps.routingMaxHops >= 2,
      include3Hop: deps.routingMaxHops >= 3,
      include4Hop: include4Hop && deps.routingMaxHops >= 4,
      maxHops: deps.routingMaxHops,
    };
  }

  function selectHighLiquidityHubTokens(
    graph: RoutingGraphLike,
    getRateWei: ((token: string) => bigint) | null,
    limit = deps.selective4HopTokenLimit,
  ) {
    const normalizedLimit = Math.max(0, Math.floor(Number(limit)));
    if (normalizedLimit <= 0) return [];

    const ranked = [...deps.polygonHubTokens]
      .filter((token) => graph?.hasToken?.(token))
      .map((token) => {
        const outgoing = graph.getEdges(token) as SwapEdge[];
        const seenPools = new Set<string>();
        let liquidityScore = 0n;

        for (const edge of outgoing) {
          if (seenPools.has(edge.poolAddress)) continue;
          seenPools.add(edge.poolAddress);
          liquidityScore += poolLiquidityWmatic(edge, getRateWei);
        }

        return {
          token,
          liquidityScore,
          degree: seenPools.size,
        };
      })
      .filter((entry) => entry.degree > 0)
      .sort((a, b) => {
        if (a.liquidityScore === b.liquidityScore) return b.degree - a.degree;
        return a.liquidityScore > b.liquidityScore ? -1 : 1;
      });

    return ranked.slice(0, normalizedLimit).map((entry) => entry.token);
  }

  function selectFullGraphPivotTokens(graph: RoutingGraphLike, getRateWei: ((token: string) => bigint) | null) {
    const limit = Math.max(
      1,
      Math.floor(Number(deps.dynamicPivotTokenLimit ?? deps.polygonHubTokens.size)),
    );
    return selectHighLiquidityHubTokens(graph, getRateWei, limit);
  }

  function quantizeLiquidityValue(value: unknown) {
    try {
      const raw = BigInt(value as any);
      if (raw <= 0n) return "0";
      const digits = raw.toString();
      return `${digits.length}:${digits.slice(0, 2)}`;
    } catch {
      return "x";
    }
  }

  function stateLiquiditySignature(state: PoolState | undefined) {
    if (!state) return "missing";
    const parts: string[] = [];
    for (const key of ["reserve0", "reserve1", "liquidity", "baseReserve", "quoteReserve"]) {
      if (state[key] != null) parts.push(`${key}=${quantizeLiquidityValue(state[key])}`);
    }
    if (Array.isArray(state.balances)) {
      parts.push(`balances=${state.balances.map((balance: unknown) => quantizeLiquidityValue(balance)).join(",")}`);
    }
    return parts.length > 0 ? parts.join(";") : "none";
  }

  function hashString32(value: string, seed = 0x811c9dc5) {
    let hash = seed >>> 0;
    for (let i = 0; i < value.length; i++) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash >>> 0;
  }

  function poolSignatureDigest(pools: PoolRecord[]) {
    let xor = 0;
    let sum = 0;
    let sum2 = 0;
    let count = 0;
    for (const pool of pools) {
      const addr = normalizeEvmAddress(pool.pool_address);
      if (!addr) continue;
      const tokens = getPoolRoutingTokens(pool).join(",");
      const signature = [
        addr,
        pool.protocol,
        tokens,
        stateLiquiditySignature(deps.stateCache.get(addr)),
      ].join(":");
      const hash = hashString32(signature);
      xor = (xor ^ hash) >>> 0;
      sum = (sum + hash) >>> 0;
      sum2 = (sum2 + hashString32(signature, 0x9e3779b9)) >>> 0;
      count++;
    }

    return {
      count,
      xor: xor.toString(16).padStart(8, "0"),
      sum: sum.toString(16).padStart(8, "0"),
      sum2: sum2.toString(16).padStart(8, "0"),
    };
  }

  function buildRouteCycleCacheKey(
    pools: PoolRecord[],
    options: {
      minLiquidityWmatic: bigint;
      selective4HopPathBudget: number;
      selective4HopMaxPathsPerToken: number;
    },
    fullPivotTokens: string[],
    selective4HopTokens: string[],
  ) {
    return JSON.stringify({
      version: 1,
      routingCycleMode: deps.routingCycleMode,
      routingMaxHops: deps.routingMaxHops,
      maxTotalPaths: deps.maxTotalPaths,
      minLiquidityWmatic: options.minLiquidityWmatic.toString(),
      selective4HopPathBudget: options.selective4HopPathBudget,
      selective4HopMaxPathsPerToken: options.selective4HopMaxPathsPerToken,
      fullPivotTokens,
      selective4HopTokens,
      pools: poolSignatureDigest(pools),
    });
  }

  function markPoolsDirty(poolAddresses: Iterable<string>) {
    let requiresFullRefresh = false;
    for (const rawAddr of poolAddresses) {
      const addr = normalizeEvmAddress(rawAddr);
      if (!addr) {
        requiresFullRefresh = true;
        continue;
      }
      dirtyPoolAddresses.add(addr);
      const pool = deps.registry.getPoolMeta(addr);
      if (!pool) {
        requiresFullRefresh = true;
        continue;
      }
      const tokens = getPoolRoutingTokens(pool);
      const touchedHubTokens = tokens.filter((token) => deps.polygonHubTokens.has(token));
      if (touchedHubTokens.length === 0) {
        requiresFullRefresh = true;
        continue;
      }
      for (const token of touchedHubTokens) dirtyHubStartTokens.add(token);
    }
    return !requiresFullRefresh;
  }

  function mergeArbPaths(...groups: ArbPathLike[][]) {
    const merged: ArbPathLike[] = [];
    const seen = new Set<string>();

    for (const group of groups) {
      for (const path of group) {
        const key = routeIdentityFromEdges(path.startToken, path.edges);
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(path);
      }
    }

    return takeTopNBy(
      merged,
      deps.maxTotalPaths,
      (a, b) => normaliseLogWeight(a.logWeight) - normaliseLogWeight(b.logWeight),
    );
  }

  function getRoutablePools(pools: PoolRecord[]) {
    const routable: PoolRecord[] = [];
    for (const pool of pools) {
      const addr = normalizeEvmAddress(pool.pool_address);
      if (!addr) continue;
      if (deps.validatePoolState(deps.stateCache.get(addr)).valid) {
        routable.push(pool);
      }
    }
    return routable;
  }

  function poolTouchesHubTokens(pool: PoolRecord, hubTokens: Set<string> = deps.hub4Tokens) {
    const tokens = getPoolRoutingTokens(pool);
    if (tokens.length < 2) return false;
    return tokens.some((token) => hubTokens.has(token));
  }

  function getPoolRoutingTokens(pool: PoolRecord): string[] {
    const addr = normalizeEvmAddress(pool.pool_address);
    const stateTokens = addr && Array.isArray(deps.stateCache.get(addr)?.tokens)
      ? deps.stateCache.get(addr)!.tokens
      : null;
    if (stateTokens) {
      const normalized: string[] = [
        ...new Set<string>(
          stateTokens
            .map((token: unknown) => normalizeEvmAddress(token))
            .filter((token: string | null): token is string => token != null),
        ),
      ];
      if (normalized.length >= 2) return normalized;
    }
    return getPoolTokens(pool)
      .map((token) => normalizeEvmAddress(token))
      .filter((token): token is string => token != null);
  }

  function invalidate(reason?: string) {
    topologyDirty = true;
    topologyCache.invalidateSerializedTopologies();
    if (reason) {
      deps.log("[runner] Marked topology dirty", "debug", {
        event: "topology_dirty",
        reason,
      });
    }
  }

  function admitPools(poolAddresses: Set<string>) {
    if (!fullGraph || !hubGraph || !poolAddresses || poolAddresses.size === 0) return 0;

    let admitted = 0;
    let changed = 0;
    const changedPools = new Set<string>();
    for (const rawAddr of poolAddresses) {
      const addr = normalizeEvmAddress(rawAddr);
      if (!addr) continue;

      const pool = deps.registry.getPoolMeta(addr);
      if (!pool || pool.status !== "active") continue;

      const fullResult = fullGraph.upsertPool(pool, deps.stateCache);
      const hubEligible = poolTouchesHubTokens(pool);
      const hubResult = hubEligible
        ? hubGraph.upsertPool(pool, deps.stateCache)
        : hubGraph.removePool(addr) > 0
          ? "removed"
          : "skipped";

      if (fullResult === "added") {
        admitted++;
      }
      if (fullResult === "added" || fullResult === "updated" || fullResult === "removed" ||
          hubResult === "added" || hubResult === "updated" || hubResult === "removed") {
        changed++;
        changedPools.add(addr);
      }
    }

    if (changed > 0) {
      markPoolsDirty(changedPools);
      invalidate(admitted > 0 ? "new_pools_admitted" : "pool_topology_updated");
    }
    return admitted;
  }

  function removePools(poolAddresses: Set<string>) {
    if (!fullGraph || !hubGraph || !poolAddresses || poolAddresses.size === 0) return 0;

    let removed = 0;
    for (const addr of poolAddresses) {
      removed += fullGraph.removePool(addr);
      hubGraph.removePool(addr);
    }

    if (removed > 0) {
      markPoolsDirty(poolAddresses);
      invalidate("unroutable_pool_removed");
    }
    return removed;
  }

  function resetGraphs() {
    hubGraph = null;
    fullGraph = null;
    cachedCycles = [];
    dirtyPoolAddresses.clear();
    dirtyHubStartTokens.clear();
    invalidate("graphs_reset");
  }

  async function refreshCycles(options: {
    force?: boolean;
    minLiquidityWmatic: bigint;
    selective4HopPathBudget: number;
    selective4HopMaxPathsPerToken: number;
    getRateWei: ((addr: string) => bigint) | null;
    clearExecutionRouteQuarantine?: (reason: string) => void;
  }): Promise<ArbPathLike[]> {
    const force = options.force === true;
    const now = Date.now();
    const intervalElapsed =
      lastCycleRefreshMs <= 0 || now - lastCycleRefreshMs >= deps.cycleRefreshIntervalMs;
    if (!force && !topologyDirty && cachedCycles.length > 0 && !intervalElapsed) return cachedCycles;

    if (cycleRefreshPromise) {
      const shouldQueueRefresh = force || topologyDirty || cachedCycles.length === 0 || intervalElapsed;
      if (!shouldQueueRefresh) return cycleRefreshPromise;

      queuedRefreshForce ||= force || topologyDirty || cachedCycles.length === 0;
      if (!queuedRefreshPromise) {
        queuedRefreshPromise = cycleRefreshPromise
          .catch(() => cachedCycles)
          .then((): Promise<ArbPathLike[]> => {
            const nextForce = queuedRefreshForce;
            queuedRefreshForce = false;
            return refreshCycles({ ...options, force: nextForce });
          })
          .finally(() => {
            queuedRefreshPromise = null;
          });
      }
      return queuedRefreshPromise;
    }

    cycleRefreshPromise = (async () => {
      deps.log("Refreshing cycle enumeration...", "info", {
        event: "cycle_refresh_start",
        forced: force,
        topologyVersion: topologyVersion + 1,
      });
      const activePools = deps.registry.getActivePoolsMeta() ?? [];
      const pools = getRoutablePools(activePools);
      deps.log(`Routing universe: ${pools.length} routable / ${activePools.length} active pools`, "info", {
        event: "routing_universe",
        activePools: activePools.length,
        routablePools: pools.length,
      });

      const rebuildGraphs = force || !fullGraph || !hubGraph || intervalElapsed;
      if (rebuildGraphs) {
        fullGraph = deps.buildGraph(pools, deps.stateCache);
        hubGraph = deps.buildHubGraph(pools, deps.hub4Tokens, deps.stateCache);
        topologyCache.invalidateSerializedTopologies();
        deps.clearGasEstimateCache();
        if (force || topologyDirty) {
          options.clearExecutionRouteQuarantine?.("topology_changed");
        }
      }

      const topologyKeyBase = `topology:${++topologyVersion}`;
      const activeHubGraph = hubGraph!;
      const activeFullGraph = fullGraph!;
      const selective4HopTokens = deps.routingCycleMode === "triangular"
        ? []
        : selectHighLiquidityHubTokens(activeFullGraph, options.getRateWei);
      const fullPivotTokens = selectFullGraphPivotTokens(activeFullGraph, options.getRateWei);
      const dirtyStartTokens = [...dirtyHubStartTokens].filter((token) => activeFullGraph.hasToken(token));
      const canUseIncrementalRefresh =
        !rebuildGraphs &&
        topologyDirty &&
        dirtyPoolAddresses.size > 0 &&
        dirtyStartTokens.length > 0 &&
        dirtyStartTokens.length <= Math.max(8, deps.selective4HopTokenLimit * 2);

      const routeCycleCacheKey = buildRouteCycleCacheKey(pools, options, fullPivotTokens, selective4HopTokens);
      let loadedPersistentCycleCache = false;
      if (!canUseIncrementalRefresh) {
        const cached = topologyCache.readPersistentRouteCycles(deps.routeCycleCacheFile, routeCycleCacheKey);
        if (cached.hit) {
          cachedCycles = topologyCache.hydratePaths(cached.paths, activeHubGraph, activeFullGraph);
          loadedPersistentCycleCache = true;
          deps.log("[runner] Loaded precomputed route cycle cache", "info", {
            event: "route_cycle_cache_hit",
            cachedPaths: cachedCycles.length,
            fullPivotTokens: fullPivotTokens.length,
            selective4HopTokens: selective4HopTokens.length,
          });
        }
      }

      if (loadedPersistentCycleCache) {
        // Hydration already filtered paths whose edges no longer exist in the active graphs.
      } else if (deps.workerCount >= 2 && deps.isWorkerPoolInitialized() && !canUseIncrementalRefresh) {
        const hubTopo = topologyCache.getSerializedTopologyCached("hub", activeHubGraph, deps.serializeTopology);
        const fullTopo = topologyCache.getSerializedTopologyCached("full", activeFullGraph, deps.serializeTopology);
        const hubTokens = [...deps.hub4Tokens].filter((t) => activeHubGraph.hasToken(t));

        const [hubSer, fullSer, selective4HopSer] = await Promise.all([
          deps.workerPool.enumerate(hubTopo, hubTokens, {
            ...cycleModeOptions(true),
            maxPathsPerToken: Math.ceil(deps.maxTotalPaths * 0.5 / Math.max(hubTokens.length, 1)),
            max4HopPathsPerToken: 2_000,
            topologyKey: `${topologyKeyBase}:hub`,
          }),
          deps.workerPool.enumerate(fullTopo, fullPivotTokens, {
            ...cycleModeOptions(false),
            maxPathsPerToken: Math.ceil(deps.maxTotalPaths * 0.35 / Math.max(fullPivotTokens.length, 1)),
            topologyKey: `${topologyKeyBase}:full`,
          }),
          selective4HopTokens.length > 0
            ? deps.workerPool.enumerate(fullTopo, selective4HopTokens, {
                include2Hop: true,
                include3Hop: true,
                include4Hop: true,
                maxPathsPerToken: Math.min(
                  options.selective4HopMaxPathsPerToken,
                  Math.ceil(options.selective4HopPathBudget / Math.max(selective4HopTokens.length, 1)),
                ),
                max4HopPathsPerToken: options.selective4HopMaxPathsPerToken,
                topologyKey: `${topologyKeyBase}:full`,
              })
            : Promise.resolve([]),
        ]);

        cachedCycles = mergeArbPaths(
          topologyCache.hydratePaths(hubSer as any[], activeHubGraph, activeFullGraph),
          topologyCache.hydratePaths(fullSer as any[], activeHubGraph, activeFullGraph),
          topologyCache.hydratePaths(selective4HopSer as any[], activeHubGraph, activeFullGraph),
        );
      } else if (canUseIncrementalRefresh) {
        const affectedPoolAddresses = new Set(dirtyPoolAddresses);
        const affectedHubGraphTokens = dirtyStartTokens.filter((token) => deps.hub4Tokens.has(token) && activeHubGraph.hasToken(token));
        const unaffectedCycles = cachedCycles.filter((path) => {
          if (dirtyStartTokens.includes(path.startToken)) return false;
          return !path.edges.some((edge) => affectedPoolAddresses.has(edge.poolAddress.toLowerCase()));
        });
        const partialHubCycles = affectedHubGraphTokens.length > 0
          ? deps.enumerateCycles(activeHubGraph, {
              startTokens: new Set(affectedHubGraphTokens),
              ...cycleModeOptions(true),
              maxPathsPerToken: Math.ceil(deps.maxTotalPaths * 0.5 / Math.max(affectedHubGraphTokens.length, 1)),
              max4HopPathsPerToken: 2_000,
              maxTotalPaths: deps.maxTotalPaths,
            })
          : [];
        const partialFullCycles = deps.enumerateCycles(activeFullGraph, {
          startTokens: new Set(dirtyStartTokens),
          ...cycleModeOptions(false),
          maxPathsPerToken: Math.ceil(deps.maxTotalPaths * 0.35 / Math.max(dirtyStartTokens.length, 1)),
          maxTotalPaths: deps.maxTotalPaths,
          minLiquidityWmatic: options.getRateWei ? options.minLiquidityWmatic : 0n,
          getRateWei: options.getRateWei,
        });
        const selectiveDirtyTokens = dirtyStartTokens.filter((token) => selective4HopTokens.includes(token));
        const selective4HopCycles = selectiveDirtyTokens.length > 0
          ? deps.enumerateCycles(activeFullGraph, {
              startTokens: new Set(selectiveDirtyTokens),
              include2Hop: true,
              include3Hop: true,
              include4Hop: true,
              maxPathsPerToken: Math.min(
                options.selective4HopMaxPathsPerToken,
                Math.ceil(options.selective4HopPathBudget / Math.max(selectiveDirtyTokens.length, 1)),
              ),
              max4HopPathsPerToken: options.selective4HopMaxPathsPerToken,
              maxTotalPaths: options.selective4HopPathBudget,
              minLiquidityWmatic: options.getRateWei ? options.minLiquidityWmatic : 0n,
              getRateWei: options.getRateWei,
            })
          : [];
        cachedCycles = mergeArbPaths(unaffectedCycles, partialHubCycles, partialFullCycles, selective4HopCycles);
      } else {
        const baseCycles = deps.enumerateCyclesDual(activeHubGraph, activeFullGraph, {
          ...cycleModeOptions(false),
          hubStartTokens: deps.hub4Tokens,
          fullStartTokens: fullPivotTokens,
          maxPathsPerToken: Math.ceil(deps.maxTotalPaths / 7),
          max4HopPathsPerToken: 2_000,
          maxTotalPaths: deps.maxTotalPaths,
          minLiquidityWmatic: options.getRateWei ? options.minLiquidityWmatic : 0n,
          getRateWei: options.getRateWei,
        });
        const selective4HopCycles = selective4HopTokens.length > 0
          ? deps.enumerateCycles(activeFullGraph, {
              startTokens: new Set(selective4HopTokens),
              include2Hop: true,
              include3Hop: true,
              include4Hop: true,
              maxPathsPerToken: Math.min(
                options.selective4HopMaxPathsPerToken,
                Math.ceil(options.selective4HopPathBudget / Math.max(selective4HopTokens.length, 1)),
              ),
              max4HopPathsPerToken: options.selective4HopMaxPathsPerToken,
              maxTotalPaths: options.selective4HopPathBudget,
              minLiquidityWmatic: options.getRateWei ? options.minLiquidityWmatic : 0n,
              getRateWei: options.getRateWei,
            })
          : [];
        cachedCycles = mergeArbPaths(baseCycles, selective4HopCycles);
      }

      if (!loadedPersistentCycleCache) {
        const wroteCache = topologyCache.writePersistentRouteCycles(
          deps.routeCycleCacheFile,
          routeCycleCacheKey,
          cachedCycles,
        );
        if (wroteCache) {
          deps.log("[runner] Stored precomputed route cycle cache", "debug", {
            event: "route_cycle_cache_store",
            cachedPaths: cachedCycles.length,
            fullPivotTokens: fullPivotTokens.length,
            selective4HopTokens: selective4HopTokens.length,
          });
        }
      }

      deps.routeCache.prune(deps.stateCache);
      topologyDirty = false;
      dirtyPoolAddresses.clear();
      dirtyHubStartTokens.clear();
      lastCycleRefreshMs = Date.now();
      deps.log(`Cycle refresh: ${cachedCycles.length} paths (${deps.routingCycleMode}, max ${deps.maxTotalPaths}).`, "info", {
        event: "cycle_refresh_complete",
        forced: force,
        topologyVersion,
        cachedPaths: cachedCycles.length,
        maxTotalPaths: deps.maxTotalPaths,
        routingCycleMode: deps.routingCycleMode,
        selective4HopTokens: selective4HopTokens.length,
        fullPivotTokens: fullPivotTokens.length,
        routeCycleCacheHit: loadedPersistentCycleCache,
        routeCacheSize: deps.routeCache.routes.length,
      });
      return cachedCycles;
    })();

    try {
      return await cycleRefreshPromise;
    } finally {
      cycleRefreshPromise = null;
    }
  }

  return {
    getCachedCycles: () => cachedCycles,
    setCachedCycles: (cycles: any[]) => {
      cachedCycles = cycles;
    },
    getTopologyVersion: () => topologyVersion,
    isTopologyDirty: () => topologyDirty,
    invalidate,
    admitPools,
    removePools,
    refreshCycles,
    resetGraphs,
    getGraphs: () => ({ hubGraph, fullGraph }),
  };
}
