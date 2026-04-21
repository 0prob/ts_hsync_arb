import { toFiniteNumber as normaliseLogWeight } from "../util/bigint.ts";
import { createTopologyCache } from "../arb/topology_cache.ts";

type TopologyServiceDeps = {
  maxTotalPaths: number;
  polygonHubTokens: Set<string>;
  hub4Tokens: Set<string>;
  workerCount: number;
  workerPool: any;
  cycleRefreshIntervalMs: number;
  routeCache: any;
  stateCache: Map<string, Record<string, any>>;
  registry: { getActivePoolsMeta: () => any[]; getPoolMeta: (address: string) => any };
  buildGraph: (pools: any[], stateCache: Map<string, Record<string, any>>) => any;
  buildHubGraph: (pools: any[], hubTokens: Set<string>, stateCache: Map<string, Record<string, any>>) => any;
  serializeTopology: (graph: any) => Record<string, any[]>;
  enumerateCycles: (graph: any, options: any) => any[];
  enumerateCyclesDual: (hubGraph: any, fullGraph: any, options: any) => any[];
  validatePoolState: (state: any) => { valid: boolean; reason?: string };
  clearGasEstimateCache: () => void;
  log: (msg: string, level?: any, meta?: any) => void;
};

export function createTopologyService(deps: TopologyServiceDeps) {
  const topologyCache = createTopologyCache(deps.maxTotalPaths);

  let hubGraph: any = null;
  let fullGraph: any = null;
  let cachedCycles: any[] = [];
  let topologyVersion = 0;
  let topologyDirty = true;
  let lastCycleRefreshMs = 0;
  let cycleRefreshRunning = false;

  function edgeLiquidityWmatic(edge: any, getRateWei: ((token: string) => bigint) | null) {
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

  function selectHighLiquidityHubTokens(graph: any, getRateWei: ((token: string) => bigint) | null) {
    const ranked = [...deps.polygonHubTokens]
      .filter((token) => graph?.hasToken?.(token))
      .map((token) => {
        const outgoing = graph.getEdges(token) as any[];
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

    return ranked.slice(0, 4).map((entry) => entry.token);
  }

  function mergeArbPaths(...groups: any[][]) {
    const merged: any[] = [];
    const seen = new Set<string>();

    for (const group of groups) {
      for (const path of group) {
        const key = `${path.startToken.toLowerCase()}::${path.edges.map((edge: any) => edge.poolAddress.toLowerCase()).join("::")}`;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(path);
      }
    }

    merged.sort((a, b) => normaliseLogWeight(a.logWeight) - normaliseLogWeight(b.logWeight));
    return merged.length > deps.maxTotalPaths ? merged.slice(0, deps.maxTotalPaths) : merged;
  }

  function getRoutablePools(pools: any[]) {
    return pools.filter((pool: any) => {
      const addr = pool.pool_address.toLowerCase();
      return deps.validatePoolState(deps.stateCache.get(addr)).valid;
    });
  }

  function poolTouchesHubTokens(pool: any, hubTokens: Set<string> = deps.hub4Tokens) {
    let tokens = pool.tokens;
    if (typeof tokens === "string") {
      try {
        tokens = JSON.parse(tokens);
      } catch {
        tokens = [];
      }
    }
    if (!Array.isArray(tokens) || tokens.length < 2) return false;
    return tokens.slice(0, 2).some((token) => hubTokens.has(String(token).toLowerCase()));
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

    if (admitted > 0) invalidate("new_pools_admitted");
    return admitted;
  }

  function removePools(poolAddresses: Set<string>) {
    if (!fullGraph || !hubGraph || !poolAddresses || poolAddresses.size === 0) return 0;

    let removed = 0;
    for (const addr of poolAddresses) {
      removed += fullGraph.removePool(addr);
      hubGraph.removePool(addr);
    }

    if (removed > 0) invalidate("unroutable_pool_removed");
    return removed;
  }

  function resetGraphs() {
    hubGraph = null;
    fullGraph = null;
    cachedCycles = [];
    invalidate("graphs_reset");
  }

  async function refreshCycles(options: {
    force?: boolean;
    minLiquidityWmatic: bigint;
    selective4HopPathBudget: number;
    selective4HopMaxPathsPerToken: number;
    getRateWei: ((addr: string) => bigint) | null;
    clearExecutionRouteQuarantine?: (reason: string) => void;
  }) {
    const force = options.force === true;
    const now = Date.now();
    const intervalElapsed =
      lastCycleRefreshMs <= 0 || now - lastCycleRefreshMs >= deps.cycleRefreshIntervalMs;
    if (!force && !topologyDirty && cachedCycles.length > 0 && !intervalElapsed) return cachedCycles;

    if (cycleRefreshRunning) {
      if (force) topologyDirty = true;
      return cachedCycles;
    }
    cycleRefreshRunning = true;

    try {
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
      const selective4HopTokens = selectHighLiquidityHubTokens(fullGraph, options.getRateWei);

      if (deps.workerCount >= 2 && deps.workerPool._initialized) {
        const hubTopo = topologyCache.getSerializedTopologyCached("hub", hubGraph, deps.serializeTopology);
        const fullTopo = topologyCache.getSerializedTopologyCached("full", fullGraph, deps.serializeTopology);
        const hubTokens = [...deps.hub4Tokens].filter((t) => hubGraph.hasToken(t));
        const fullTokens = [...deps.polygonHubTokens].filter((t) => fullGraph.hasToken(t));

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
          topologyCache.hydratePaths(hubSer, hubGraph, fullGraph),
          topologyCache.hydratePaths(fullSer, hubGraph, fullGraph),
          topologyCache.hydratePaths(selective4HopSer, hubGraph, fullGraph),
        );
      } else {
        const baseCycles = deps.enumerateCyclesDual(hubGraph, fullGraph, {
          include2Hop: true,
          include3Hop: true,
          maxPathsPerToken: Math.ceil(deps.maxTotalPaths / 7),
          max4HopPathsPerToken: 2_000,
          maxTotalPaths: deps.maxTotalPaths,
          minLiquidityWmatic: options.getRateWei ? options.minLiquidityWmatic : 0n,
          getRateWei: options.getRateWei,
        });
        const selective4HopCycles = selective4HopTokens.length > 0
          ? deps.enumerateCycles(fullGraph, {
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
    } finally {
      cycleRefreshRunning = false;
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
