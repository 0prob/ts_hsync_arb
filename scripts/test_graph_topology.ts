import assert from "node:assert/strict";

import { createTopologyService } from "../src/runtime/topology_service.ts";
import { buildGraph, buildHubGraph, serializeTopology } from "../src/routing/graph.ts";
import { validatePoolState } from "../src/state/normalizer.ts";
import { createTopologyCache } from "../src/arb/topology_cache.ts";

const HUB_TOKEN = "0xhub";
const POOL_ADDRESS = "0xpool";

const routeCache = {
  routes: [],
  prune: () => {},
};

const stateCache = new Map<string, Record<string, any>>([
  [POOL_ADDRESS, {
    poolId: POOL_ADDRESS,
    protocol: "BALANCER_V2",
    token0: "0xt0",
    token1: "0xt1",
    tokens: ["0xt0", "0xt1", HUB_TOKEN],
    fee: 3_000_000_000_000_000n,
    balances: [1_000n, 1_000n, 1_000n],
    weights: [333_333_333_333_333_333n, 333_333_333_333_333_333n, 333_333_333_333_333_334n],
    swapFee: 3_000_000_000_000_000n,
    timestamp: Date.now(),
  }],
]);

const pool = {
  pool_address: POOL_ADDRESS,
  protocol: "BALANCER_V2",
  status: "active",
  tokens: ["0xt0", "0xt1", HUB_TOKEN],
  metadata: {},
};

const pools: any[] = [];

const topologyService = createTopologyService({
  routingCycleMode: "all",
  routingMaxHops: 4,
  maxTotalPaths: 100,
  polygonHubTokens: new Set([HUB_TOKEN]),
  hub4Tokens: new Set([HUB_TOKEN]),
  selective4HopTokenLimit: 0,
  workerCount: 0,
  workerPool: { _initialized: false },
  isWorkerPoolInitialized: () => false,
  cycleRefreshIntervalMs: 60_000,
  routeCache,
  stateCache,
  registry: {
    getActivePoolsMeta: () => pools,
    getPoolMeta: (address: string) => pools.find((entry) => entry.pool_address.toLowerCase() === address),
  },
  buildGraph,
  buildHubGraph,
  serializeTopology,
  enumerateCycles: () => [],
  enumerateCyclesDual: () => [],
  validatePoolState,
  clearGasEstimateCache: () => {},
  log: () => {},
});

await topologyService.refreshCycles({
  force: true,
  minLiquidityWmatic: 0n,
  selective4HopPathBudget: 0,
  selective4HopMaxPathsPerToken: 0,
  getRateWei: null,
});

pools.push(pool);

const admitted = topologyService.admitPools(new Set([POOL_ADDRESS]));
assert.equal(admitted, 1, "incremental graph admission should add the new pool once");

const { hubGraph, fullGraph } = topologyService.getGraphs();
assert(fullGraph.getPoolEdge(POOL_ADDRESS, "0xt0", HUB_TOKEN), "full graph should contain the newly admitted multi-token pool");
assert(hubGraph.getPoolEdge(POOL_ADDRESS, "0xt0", HUB_TOKEN), "hub graph should admit pools that touch a hub token beyond the first two token slots");

const topologyCache = createTopologyCache(10);
const hydrated = topologyCache.hydratePaths([
  {
    startToken: "0xt0",
    poolAddresses: [POOL_ADDRESS, POOL_ADDRESS],
    tokenIns: ["0xt0", HUB_TOKEN],
    tokenOuts: [HUB_TOKEN, "0xt0"],
    zeroForOnes: [true, false],
    hopCount: 99,
    logWeight: 0,
  },
], hubGraph, fullGraph);
assert.equal(hydrated.length, 1, "topology hydration should rebuild executable paths from serialized routes");
assert.equal(
  hydrated[0].hopCount,
  hydrated[0].edges.length,
  "hydrated paths should derive hop count from executable edges instead of stale serialized metadata",
);
assert.equal(
  topologyCache.hydratePaths([
    {
      startToken: "0xt0",
      poolAddresses: [POOL_ADDRESS],
      tokenIns: [],
      tokenOuts: ["0xt0"],
      zeroForOnes: [true],
      hopCount: 1,
      logWeight: 0,
    },
  ], hubGraph, fullGraph).length,
  0,
  "topology hydration should drop malformed serialized paths with mismatched token arrays",
);
assert.equal(
  topologyCache.hydratePaths([
    {
      startToken: null as any,
      poolAddresses: [POOL_ADDRESS],
      tokenIns: ["0xt0"],
      tokenOuts: ["0xt0"],
      zeroForOnes: [true],
      hopCount: 1,
      logWeight: 0,
    },
  ], hubGraph, fullGraph).length,
  0,
  "topology hydration should drop malformed serialized paths instead of throwing on non-string start tokens",
);
assert.equal(
  topologyCache.hydratePaths([
    {
      startToken: "0xt0",
      poolAddresses: POOL_ADDRESS as any,
      tokenIns: ["0xt0"],
      tokenOuts: ["0xt0"],
      zeroForOnes: [true],
      hopCount: 1,
      logWeight: 0,
    },
  ], hubGraph, fullGraph).length,
  0,
  "topology hydration should drop malformed serialized paths instead of treating string poolAddresses as iterable hop arrays",
);
assert.equal(
  topologyCache.hydratePaths([
    {
      startToken: "0xt0",
      poolAddresses: [POOL_ADDRESS, POOL_ADDRESS],
      tokenIns: ["0xt0", HUB_TOKEN],
      tokenOuts: [HUB_TOKEN, "0xt0"],
      zeroForOnes: [false, false],
      hopCount: 2,
      logWeight: 0,
    },
  ], hubGraph, fullGraph).length,
  0,
  "topology hydration should reject serialized paths whose zeroForOne directions no longer match the executable edge orientation",
);

console.log("Graph topology checks passed.");
