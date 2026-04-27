import assert from "node:assert/strict";

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

console.log("Topology service checks passed.");
