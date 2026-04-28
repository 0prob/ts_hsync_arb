import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createTopologyService } from "../src/runtime/topology_service.ts";
import {
  buildGraph,
  buildHubGraph,
  serializeTopology,
} from "../src/routing/graph.ts";
import { enumerateCycles, enumerateCyclesDual } from "../src/routing/enumerate_cycles.ts";
import { normalizePoolState, validatePoolState } from "../src/state/normalizer.ts";

const ONE = 10n ** 18n;
const USDC_DEC = 10n ** 6n;
const PRICE_DEC = 10n ** 8n;
const pool = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const quote = "0x1111111111111111111111111111111111111111";
const base = "0x2222222222222222222222222222222222222222";
const base2 = "0x5555555555555555555555555555555555555555";

function woofiState(tokens: string[]) {
  return normalizePoolState(
    pool,
    "WOOFI",
    tokens,
    {
      quoteToken: quote,
      quoteReserve: 1_000_000n * USDC_DEC,
      quoteDecimals: 6,
      quoteDec: USDC_DEC,
      baseStates: tokens.filter((token) => token !== quote).map((token) => ({
        token,
        reserve: 1_000n * ONE,
        feeRate: 30n,
        maxGamma: ONE,
        maxNotionalSwap: 10_000_000n * USDC_DEC,
        price: 2_000n * PRICE_DEC,
        spread: 0n,
        coeff: 0n,
        feasible: true,
        baseDecimals: 18,
        quoteDecimals: 6,
        priceDecimals: 8,
        baseDec: ONE,
        quoteDec: USDC_DEC,
        priceDec: PRICE_DEC,
      })),
      fetchedAt: Date.now(),
    },
  );
}

const poolRecord = {
  pool_address: pool,
  protocol: "WOOFI",
  status: "active",
  tokens: [quote, base],
  metadata: {},
};
const pools = [poolRecord];
const stateCache = new Map([[pool, woofiState([quote, base])!]]);

const service = createTopologyService({
  routingCycleMode: "all",
  routingMaxHops: 3,
  maxTotalPaths: 20,
  polygonHubTokens: new Set([quote, base, base2]),
  hub4Tokens: new Set([quote]),
  selective4HopTokenLimit: 0,
  workerCount: 1,
  workerPool: { enumerate: async () => [] },
  isWorkerPoolInitialized: () => false,
  cycleRefreshIntervalMs: 60_000,
  routeCache: { prune: () => {}, routes: [] },
  stateCache,
  registry: {
    getActivePoolsMeta: () => pools,
    getPoolMeta: () => poolRecord,
  },
  buildGraph,
  buildHubGraph,
  serializeTopology,
  enumerateCycles,
  enumerateCyclesDual,
  validatePoolState,
  clearGasEstimateCache: () => {},
  log: () => {},
});

await service.refreshCycles({
  force: true,
  minLiquidityWmatic: 0n,
  selective4HopPathBudget: 0,
  selective4HopMaxPathsPerToken: 0,
  getRateWei: null,
});

assert.equal(service.isTopologyDirty(), false);
assert.ok(service.getGraphs().fullGraph?.getPoolEdge(pool, base, quote));
assert.equal(service.getGraphs().fullGraph?.getPoolEdge(pool, base2, quote), undefined);

stateCache.set(pool, woofiState([quote, base, base2])!);
const admitted = service.admitPools(new Set([pool]));

assert.equal(admitted, 0, "existing pools should not be counted as newly admitted");
assert.equal(service.isTopologyDirty(), true, "token-topology changes on existing pools should mark cycles dirty");
assert.ok(
  service.getGraphs().fullGraph?.getPoolEdge(pool, base2, quote),
  "existing pool upsert should refresh graph edges when canonical state tokens expand",
);

{
  const poolA = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const poolB = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const poolRecordB = {
    ...poolRecord,
    pool_address: poolB,
    tokens: [quote, base2],
  };
  const fakeEdge = {
    protocol: "QUICKSWAP_V2",
    poolAddress: poolA,
    tokenIn: quote,
    tokenOut: base,
    zeroForOne: true,
    stateRef: { reserve0: 1n, reserve1: 1n },
  };
  const fakeGraph = {
    _edgesByPool: new Map(),
    hasToken: (token: string) => [quote, base, base2].includes(token),
    getEdges: (token: string) => token === quote ? [fakeEdge] : [],
    addPool: () => {},
    upsertPool: () => "unchanged",
    removePool: () => 0,
    getPoolEdge: () => undefined,
  };
  const pathViaBase = {
    startToken: quote,
    hopCount: 2,
    logWeight: -10,
    edges: [
      { protocol: "QUICKSWAP_V2", poolAddress: poolA, tokenIn: quote, tokenOut: base, zeroForOne: true },
      { protocol: "QUICKSWAP_V2", poolAddress: poolB, tokenIn: base, tokenOut: quote, zeroForOne: false },
    ],
  };
  const pathViaBase2 = {
    startToken: quote,
    hopCount: 2,
    logWeight: -9,
    edges: [
      { protocol: "QUICKSWAP_V2", poolAddress: poolA, tokenIn: quote, tokenOut: base2, zeroForOne: true },
      { protocol: "QUICKSWAP_V2", poolAddress: poolB, tokenIn: base2, tokenOut: quote, zeroForOne: false },
    ],
  };
  const edgeByRoute = new Map(
    [...pathViaBase.edges, ...pathViaBase2.edges].map((edge) => [
      `${edge.poolAddress}:${edge.tokenIn}:${edge.tokenOut}`,
      edge,
    ]),
  );
  fakeGraph.getPoolEdge = (poolAddress: string, tokenIn: string, tokenOut: string) =>
    edgeByRoute.get(`${poolAddress.toLowerCase()}:${tokenIn.toLowerCase()}:${tokenOut.toLowerCase()}`);

  const mergeService = createTopologyService({
    routingCycleMode: "all",
    routingMaxHops: 4,
    maxTotalPaths: 20,
    polygonHubTokens: new Set([quote]),
    hub4Tokens: new Set([quote]),
    selective4HopTokenLimit: 1,
    workerCount: 1,
    workerPool: { enumerate: async () => [] },
    isWorkerPoolInitialized: () => false,
    cycleRefreshIntervalMs: 60_000,
    routeCache: { prune: () => {}, routes: [] },
    stateCache,
    registry: {
      getActivePoolsMeta: () => pools,
      getPoolMeta: () => poolRecord,
    },
    buildGraph: () => fakeGraph as any,
    buildHubGraph: () => fakeGraph as any,
    serializeTopology,
    enumerateCycles: () => [pathViaBase2],
    enumerateCyclesDual: () => [pathViaBase],
    validatePoolState: () => ({ valid: true }),
    clearGasEstimateCache: () => {},
    log: () => {},
  });

  const mergedCycles = await mergeService.refreshCycles({
    force: true,
    minLiquidityWmatic: 0n,
    selective4HopPathBudget: 10,
    selective4HopMaxPathsPerToken: 10,
    getRateWei: null,
  });

  assert.equal(
    mergedCycles.length,
    2,
    "cycle refresh should preserve same-pool-sequence routes when token directions differ",
  );

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "route-cycle-cache-"));
  const cacheFile = path.join(tempDir, "cycles.json");
  let enumerateCalls = 0;
  try {
    const cacheService = (enumerateCyclesDualImpl: any, activePools = [poolRecord, poolRecordB]) => createTopologyService({
      routingCycleMode: "all",
      routingMaxHops: 4,
      maxTotalPaths: 20,
      polygonHubTokens: new Set([quote]),
      hub4Tokens: new Set([quote]),
      selective4HopTokenLimit: 0,
      dynamicPivotTokenLimit: 1,
      routeCycleCacheFile: cacheFile,
      workerCount: 1,
      workerPool: { enumerate: async () => [] },
      isWorkerPoolInitialized: () => false,
      cycleRefreshIntervalMs: 60_000,
      routeCache: { prune: () => {}, routes: [] },
      stateCache,
      registry: {
        getActivePoolsMeta: () => activePools,
        getPoolMeta: (address: string) =>
          activePools.find((pool) => pool.pool_address === address.toLowerCase()) ?? poolRecord,
      },
      buildGraph: () => fakeGraph as any,
      buildHubGraph: () => fakeGraph as any,
      serializeTopology,
      enumerateCycles: () => [],
      enumerateCyclesDual: enumerateCyclesDualImpl,
      validatePoolState: () => ({ valid: true }),
      clearGasEstimateCache: () => {},
      log: () => {},
    });

    await cacheService(() => {
      enumerateCalls++;
      return [pathViaBase];
    }).refreshCycles({
      force: true,
      minLiquidityWmatic: 0n,
      selective4HopPathBudget: 0,
      selective4HopMaxPathsPerToken: 0,
      getRateWei: null,
    });

    const cachedCycles = await cacheService(() => {
      enumerateCalls++;
      return [pathViaBase2];
    }, [poolRecordB, poolRecord]).refreshCycles({
      force: true,
      minLiquidityWmatic: 0n,
      selective4HopPathBudget: 0,
      selective4HopMaxPathsPerToken: 0,
      getRateWei: null,
    });

    assert.equal(enumerateCalls, 1, "matching persistent route-cycle cache should skip re-enumeration across stable pool-set order changes");
    assert.deepEqual(
      cachedCycles.map((cycle) => cycle.edges.map((edge) => edge.tokenOut)),
      [[base, quote]],
      "persistent route-cycle cache should hydrate the precomputed route from active graph edges",
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

console.log("Topology service checks passed.");
