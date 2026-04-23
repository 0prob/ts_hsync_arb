import { toFiniteNumber as normaliseLogWeight } from "../util/bigint.ts";
import { createTopologyCache } from "../arb/topology_cache.ts";
import type { ArbPathLike } from "../arb/assessment.ts";
import { getPoolTokens } from "../util/pool_record.ts";
import type { RouteCache } from "../routing/route_cache.ts";
import type { RoutingGraph } from "../routing/graph.ts";

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
type RoutingGraphLike = Pick<RoutingGraph, "hasToken" | "getEdges" | "addPool" | "removePool" | "getPoolEdge"> & {
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
  maxTotalPaths: number;
  polygonHubTokens: Set<string>;
  hub4Tokens: Set<string>;
  selective4HopTokenLimit: number;
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

  function edgeLiquidityWmatic(edge: SwapEdge, getRateWei: ((token: string) => bigint) | null) {
    if (!getRateWei) return 0n;
    const state = edge?.stateRef;
    if (!state?.reserve0 || !state?.reserve1) return 0n;
    const token0 = edge.zeroForOne ? edge.tokenIn : edge.tokenOut;
    const token1 = edge.zeroForOne ? edge.tokenOut : edge.tokenIn;
    const token0Rate = getRateWei(token0);
    const token1Rate = getRateWei(token1);
    if (token0Rate <= 0n || token1Rate <= 0n) return 0n;
    return state.reserve0 * token0Rate + state.reserve1 * token1Rate;
  }

  function selectHighLiquidityHubTokens(graph: RoutingGraphLike, getRateWei: ((token: string) => bigint) | null) {
    const ranked = [...deps.polygonHubTokens]
      .filter((token) => graph?.hasToken?.(token))
      .map((token) => {
        const outgoing = graph.getEdges(token) as SwapEdge[];
        const seenPools = new Set<string>();
        let liquidityScore = 0n;

        for (const edge of outgoing) {
          if (seenPools.has(edge.poolAddress)) continue;
          seenPools.add(edge.poolAddress);
          liquidityScore += edgeLiquidityWmatic(edge, getRateWei);
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

    return ranked.slice(0, deps.selective4HopTokenLimit).map((entry) => entry.token);
  }

  function markPoolsDirty(poolAddresses: Iterable<string>) {
    let requiresFullRefresh = false;
    for (const rawAddr of poolAddresses) {
      const addr = rawAddr.toLowerCase();
      dirtyPoolAddresses.add(addr);
      const pool = deps.registry.getPoolMeta(addr);
      if (!pool) {
        requiresFullRefresh = true;
        continue;
      }
      const tokens = getPoolTokens(pool);
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
        const key = `${path.startToken.toLowerCase()}::${path.edges.map((edge) => edge.poolAddress.toLowerCase()).join("::")}`;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(path);
      }
    }

    merged.sort((a, b) => normaliseLogWeight(a.logWeight) - normaliseLogWeight(b.logWeight));
    return merged.length > deps.maxTotalPaths ? merged.slice(0, deps.maxTotalPaths) : merged;
  }

  function getRoutablePools(pools: PoolRecord[]) {
    return pools.filter((pool) => {
      const addr = pool.pool_address.toLowerCase();
      return deps.validatePoolState(deps.stateCache.get(addr)).valid;
    });
  }

  function poolTouchesHubTokens(pool: PoolRecord, hubTokens: Set<string> = deps.hub4Tokens) {
    const tokens = getPoolTokens(pool);
    if (tokens.length < 2) return false;
    return tokens.some((token) => hubTokens.has(token));
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
    for (const addr of poolAddresses) {
      if (fullGraph._edgesByPool.has(addr)) continue;

      const pool = deps.registry.getPoolMeta(addr);
      if (!pool || pool.status !== "active") continue;

      fullGraph.addPool(pool, deps.stateCache);
      if (fullGraph._edgesByPool.has(addr)) {
        admitted++;
        if (poolTouchesHubTokens(pool)) {
          hubGraph.addPool(pool, deps.stateCache);
        }
      }
    }

    if (admitted > 0) {
      markPoolsDirty(poolAddresses);
      invalidate("new_pools_admitted");
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
      const selective4HopTokens = selectHighLiquidityHubTokens(activeFullGraph, options.getRateWei);
      const dirtyStartTokens = [...dirtyHubStartTokens].filter((token) => activeFullGraph.hasToken(token));
      const canUseIncrementalRefresh =
        !rebuildGraphs &&
        topologyDirty &&
        dirtyPoolAddresses.size > 0 &&
        dirtyStartTokens.length > 0 &&
        dirtyStartTokens.length <= Math.max(8, deps.selective4HopTokenLimit * 2);

      if (deps.workerCount >= 2 && deps.isWorkerPoolInitialized() && !canUseIncrementalRefresh) {
        const hubTopo = topologyCache.getSerializedTopologyCached("hub", activeHubGraph, deps.serializeTopology);
        const fullTopo = topologyCache.getSerializedTopologyCached("full", activeFullGraph, deps.serializeTopology);
        const hubTokens = [...deps.hub4Tokens].filter((t) => activeHubGraph.hasToken(t));
        const fullTokens = [...deps.polygonHubTokens].filter((t) => activeFullGraph.hasToken(t));

        const [hubSer, fullSer, selective4HopSer] = await Promise.all([
          deps.workerPool.enumerate(hubTopo, hubTokens, {
            include2Hop: true,
            include3Hop: true,
            include4Hop: true,
            maxPathsPerToken: Math.ceil(deps.maxTotalPaths * 0.5 / Math.max(hubTokens.length, 1)),
            max4HopPathsPerToken: 2_000,
            topologyKey: `${topologyKeyBase}:hub`,
          }),
          deps.workerPool.enumerate(fullTopo, fullTokens, {
            include2Hop: true,
            include3Hop: true,
            include4Hop: false,
            maxPathsPerToken: Math.ceil(deps.maxTotalPaths * 0.35 / Math.max(fullTokens.length, 1)),
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
              include2Hop: true,
              include3Hop: true,
              include4Hop: true,
              maxPathsPerToken: Math.ceil(deps.maxTotalPaths * 0.5 / Math.max(affectedHubGraphTokens.length, 1)),
              max4HopPathsPerToken: 2_000,
              maxTotalPaths: deps.maxTotalPaths,
            })
          : [];
        const partialFullCycles = deps.enumerateCycles(activeFullGraph, {
          startTokens: new Set(dirtyStartTokens),
          include2Hop: true,
          include3Hop: true,
          include4Hop: false,
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
          include2Hop: true,
          include3Hop: true,
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

      deps.routeCache.prune(deps.stateCache);
      topologyDirty = false;
      dirtyPoolAddresses.clear();
      dirtyHubStartTokens.clear();
      lastCycleRefreshMs = Date.now();
      deps.log(`Cycle refresh: ${cachedCycles.length} paths (hub+full, max ${deps.maxTotalPaths}).`, "info", {
        event: "cycle_refresh_complete",
        forced: force,
        topologyVersion,
        cachedPaths: cachedCycles.length,
        maxTotalPaths: deps.maxTotalPaths,
        selective4HopTokens: selective4HopTokens.length,
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
