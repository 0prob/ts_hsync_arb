import assert from "node:assert/strict";

import { createTopologyService } from "../src/runtime/topology_service.ts";

const HUB_TOKEN = "0xhub";
const POOL_ADDRESS = "0xpool";

const routeCache = {
  routes: [],
  prune: () => {},
};

const stateCache = new Map<string, Record<string, any>>([
  [POOL_ADDRESS, {
    timestamp: Date.now(),
  }],
]);

const pools = [{
  pool_address: POOL_ADDRESS,
  protocol: "UNISWAP_V2",
  status: "active",
  tokens: [HUB_TOKEN, "0xother"],
  metadata: {},
}];

let dualOptions: Record<string, unknown> | null = null;
let fullGraphEnumerateCalls = 0;

const topologyService = createTopologyService({
  routingCycleMode: "triangular",
  routingMaxHops: 6,
  maxTotalPaths: 100,
  polygonHubTokens: new Set([HUB_TOKEN]),
  hub4Tokens: new Set([HUB_TOKEN]),
  selective4HopTokenLimit: 4,
  workerCount: 0,
  workerPool: {
    enumerate: async () => [],
  },
  isWorkerPoolInitialized: () => false,
  cycleRefreshIntervalMs: 60_000,
  routeCache,
  stateCache,
  registry: {
    getActivePoolsMeta: () => pools,
    getPoolMeta: (address: string) => pools.find((entry) => entry.pool_address.toLowerCase() === address),
  },
  buildGraph: () => ({
    hasToken: (token: string) => token === HUB_TOKEN,
    getEdges: () => [],
    addPool: () => {},
    removePool: () => 0,
    getPoolEdge: () => null,
    _edgesByPool: new Map(),
  }),
  buildHubGraph: () => ({
    hasToken: (token: string) => token === HUB_TOKEN,
    getEdges: () => [],
    addPool: () => {},
    removePool: () => 0,
    getPoolEdge: () => null,
    _edgesByPool: new Map(),
  }),
  serializeTopology: () => ({}),
  enumerateCycles: () => {
    fullGraphEnumerateCalls += 1;
    return [];
  },
  enumerateCyclesDual: (_hubGraph, _fullGraph, options) => {
    dualOptions = options;
    return [];
  },
  validatePoolState: () => ({ valid: true }),
  clearGasEstimateCache: () => {},
  log: () => {},
});

await topologyService.refreshCycles({
  force: true,
  minLiquidityWmatic: 1n,
  selective4HopPathBudget: 50,
  selective4HopMaxPathsPerToken: 25,
  getRateWei: () => 1n,
});

assert(dualOptions, "triangular mode should still enumerate through the dual-graph base path");
assert.equal(dualOptions?.include2Hop, false, "triangular mode should disable 2-hop cycle enumeration");
assert.equal(dualOptions?.include3Hop, true, "triangular mode should keep 3-hop cycle enumeration enabled");
assert.equal(dualOptions?.include4Hop, false, "triangular mode should disable 4-hop cycle enumeration");
assert.equal(fullGraphEnumerateCalls, 0, "triangular mode should skip selective 4-hop full-graph enumeration");

console.log("Triangular routing mode checks passed.");
