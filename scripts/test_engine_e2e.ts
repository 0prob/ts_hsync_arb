import assert from "node:assert/strict";

import { createExecutionCoordinator } from "../src/arb/execution_coordinator.ts";
import { createArbSearcher } from "../src/arb/search.ts";
import { assessRouteResult, minProfitInTokenUnits } from "../src/arb/assessment.ts";
import { client } from "../src/hypersync/client.ts";
import { buildArbTx } from "../src/execution/build_tx.ts";
import { getV2AmountOut } from "../src/math/uniswap_v2.ts";
import { evaluateCandidatePipeline } from "../src/routing/candidate_pipeline.ts";
import { enumerateCycles } from "../src/routing/enumerate_cycles.ts";
import { routeKeyFromEdges } from "../src/routing/finder.ts";
import { buildGraph } from "../src/routing/graph.ts";
import { getPathFreshness } from "../src/routing/path_freshness.ts";
import { partitionFreshCandidates } from "../src/routing/filter_fresh_candidates.ts";
import { RouteCache } from "../src/routing/route_cache.ts";
import { evaluatePaths, optimizeInputAmount, simulateRoute } from "../src/routing/simulator.ts";
import { validatePoolState } from "../src/state/normalizer.ts";
import { StateWatcher, WATCHER_TOPIC0, watcherProgressMeta } from "../src/state/watcher.ts";

const ONE = 10n ** 18n;
const WMATIC = "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270";
const USDC = "0x2791bca1f2de4661ed88a30c99a7a9449aa84174";
const CHEAP_WMATIC_POOL = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const EXPENSIVE_WMATIC_POOL = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const EXECUTOR = "0x3333333333333333333333333333333333333333";
const TEST_PRIVATE_KEY = `0x${"11".repeat(32)}`;
const MIN_PROFIT_WEI = 1n;
const GAS_PRICE_WEI = 1n;
const TEST_AMOUNT = ONE;
const INITIAL_BLOCK = 100;

type PoolRecord = {
  pool_address: string;
  protocol: string;
  status: string;
  tokens: string[];
  metadata?: unknown;
};

function placeholderState(pool: PoolRecord) {
  return {
    poolId: pool.pool_address,
    protocol: pool.protocol,
    tokens: pool.tokens,
    timestamp: 0,
  };
}

function decodedSync(reserve0: bigint, reserve1: bigint) {
  return {
    indexed: [],
    body: [{ val: reserve0.toString() }, { val: reserve1.toString() }],
  };
}

function fmtPath(path: { edges: Array<{ tokenIn: string; tokenOut: string; poolAddress: string }> }) {
  return path.edges
    .map((edge) => `${edge.tokenIn.slice(0, 6)}->${edge.tokenOut.slice(0, 6)}@${edge.poolAddress.slice(0, 6)}`)
    .join(" | ");
}

function normalizeLogMeta(meta: unknown) {
  return typeof meta === "function" ? (meta as () => unknown)() : meta;
}

class InMemoryRegistry {
  private pools: Map<string, PoolRecord>;
  persistedStates: Array<{ pool_address: string; block: number; data: any }> = [];
  progress: Array<{ key: string; block: number; rollbackGuard: any }> = [];

  constructor(pools: PoolRecord[]) {
    this.pools = new Map(pools.map((pool) => [pool.pool_address.toLowerCase(), pool]));
  }

  getPoolMeta(addr: string) {
    return this.pools.get(addr.toLowerCase());
  }

  getActivePoolsMeta() {
    return [...this.pools.values()].filter((pool) => pool.status === "active");
  }

  batchUpdateStates(states: Array<{ pool_address: string; block: number; data: any }>) {
    this.persistedStates.push(
      ...states.map((state) => ({
        pool_address: state.pool_address.toLowerCase(),
        block: Number(state.block),
        data: state.data,
      })),
    );
  }

  commitWatcherProgress(key: string, block: number, rollbackGuard: any) {
    this.progress.push({ key, block, rollbackGuard });
  }
}

const pools: PoolRecord[] = [
  {
    pool_address: CHEAP_WMATIC_POOL,
    protocol: "QUICKSWAP_V2",
    status: "active",
    tokens: [WMATIC, USDC],
  },
  {
    pool_address: EXPENSIVE_WMATIC_POOL,
    protocol: "SUSHISWAP_V2",
    status: "active",
    tokens: [WMATIC, USDC],
  },
];

const registry = new InMemoryRegistry(pools);
const stateCache = new Map<string, any>(
  pools.map((pool) => [pool.pool_address, placeholderState(pool)]),
);
const watcher: any = new StateWatcher(registry, stateCache);

const hypersyncLogs = [
  {
    address: CHEAP_WMATIC_POOL,
    blockNumber: 101,
    transactionHash: "0x" + "01".repeat(32),
    transactionIndex: 0,
    logIndex: 0,
    topic0: WATCHER_TOPIC0.V2_SYNC,
  },
  {
    address: EXPENSIVE_WMATIC_POOL,
    blockNumber: 102,
    transactionHash: "0x" + "02".repeat(32),
    transactionIndex: 0,
    logIndex: 0,
    topic0: WATCHER_TOPIC0.V2_SYNC,
  },
];
const decodedLogs = [
  decodedSync(1_000n * ONE, 2_000n * ONE),
  decodedSync(2_000n * ONE, 1_000n * ONE),
];

const originalGet = client.get;
const capturedQueries: any[] = [];
client.get = async (query: any) => {
  capturedQueries.push(query);
  return {
    nextBlock: 103,
    archiveHeight: 103,
    rollbackGuard: {
      block_number: 102,
      block_hash: "0x" + "ab".repeat(32),
      first_block_number: 101,
      first_parent_hash: "0x" + "cd".repeat(32),
    },
    data: { logs: hypersyncLogs },
  };
};

watcher._lastBlock = INITIAL_BLOCK;
watcher._running = true;
watcher._closed = false;
watcher._watchedAddresses = pools.map((pool) => pool.pool_address);
watcher._watchedAddressSet = new Set(watcher._watchedAddresses);
watcher._sleep = async () => {};
watcher._decoder = {
  decodeLogs: async (logs: any[]) => {
    assert.deepEqual(
      logs.map((log) => log.address),
      [CHEAP_WMATIC_POOL, EXPENSIVE_WMATIC_POOL],
      "watcher should decode the exact HyperSync logs returned by the poll",
    );
    return decodedLogs;
  },
};

try {
  const pollResult = await watcher._pollOnce();
  assert.equal(capturedQueries.length, 1, "small watched universes should use one selective HyperSync request");
  assert.equal(capturedQueries[0].fromBlock, INITIAL_BLOCK + 1);
  assert.deepEqual(capturedQueries[0].logs[0].address.sort(), [CHEAP_WMATIC_POOL, EXPENSIVE_WMATIC_POOL].sort());
  assert.ok(
    capturedQueries[0].logs[0].topics[0].includes(WATCHER_TOPIC0.V2_SYNC),
    "watcher query should request V2 Sync logs needed to update swap reserves",
  );
  assert.deepEqual(
    pollResult.data.logs.map((log: any) => log.address),
    [CHEAP_WMATIC_POOL, EXPENSIVE_WMATIC_POOL],
    "HyperSync poll result should preserve both swap-state logs",
  );

  const changedPools = await watcher._handleLogs(pollResult.data.logs);
  assert.deepEqual([...changedPools].sort(), [CHEAP_WMATIC_POOL, EXPENSIVE_WMATIC_POOL].sort());
  assert.equal(registry.persistedStates.length, 2, "watcher should persist each changed pool state");
  assert.deepEqual(
    registry.persistedStates.map((state) => state.block).sort((a, b) => a - b),
    [101, 102],
    "persisted watcher states should retain the source log block numbers",
  );

  const progress = watcherProgressMeta(
    pollResult.nextBlock,
    watcher._lastBlock,
    pollResult.archiveHeight,
    pollResult.data.logs.length,
    pollResult.shardSummary,
  );
  watcher._lastBlock = progress.checkpointBlock;
  registry.commitWatcherProgress("HYPERSYNC_WATCHER", watcher._lastBlock, pollResult.rollbackGuard);

  assert.equal(watcher._lastBlock, 102, "watcher checkpoint should advance after the retrieved logs are processed");
  assert.equal(registry.progress.at(-1)?.block, 102);
} finally {
  client.get = originalGet;
}

const cheapState = stateCache.get(CHEAP_WMATIC_POOL);
const expensiveState = stateCache.get(EXPENSIVE_WMATIC_POOL);
assert.deepEqual(validatePoolState(cheapState), { valid: true });
assert.deepEqual(validatePoolState(expensiveState), { valid: true });
assert.equal(cheapState.reserve0, 1_000n * ONE);
assert.equal(cheapState.reserve1, 2_000n * ONE);
assert.equal(expensiveState.reserve0, 2_000n * ONE);
assert.equal(expensiveState.reserve1, 1_000n * ONE);

const graph = buildGraph(registry.getActivePoolsMeta(), stateCache);
const cycles = enumerateCycles(graph, {
  startTokens: new Set([WMATIC]),
  include2Hop: true,
  include3Hop: false,
  include4Hop: false,
  hubTokensOnly: false,
  maxPathsPerToken: 10,
  maxTotalPaths: 10,
  dedup: false,
});

assert.ok(cycles.length >= 2, "routing should enumerate both directions across the two updated V2 pools");

const targetPath = cycles.find((path: any) =>
  path.edges[0].poolAddress === CHEAP_WMATIC_POOL &&
  path.edges[1].poolAddress === EXPENSIVE_WMATIC_POOL &&
  path.edges[0].tokenIn === WMATIC &&
  path.edges[1].tokenOut === WMATIC
);
assert.ok(targetPath, "routing should include the profitable WMATIC -> USDC -> WMATIC cycle");

const directSimulation = simulateRoute(targetPath, TEST_AMOUNT, stateCache);
const expectedHop1 = getV2AmountOut(TEST_AMOUNT, 1_000n * ONE, 2_000n * ONE, 997n, 1000n);
const expectedHop2 = getV2AmountOut(expectedHop1, 1_000n * ONE, 2_000n * ONE, 997n, 1000n);
assert.deepEqual(
  directSimulation.hopAmounts,
  [TEST_AMOUNT, expectedHop1, expectedHop2],
  "route simulation should match the independent constant-product formula hop by hop",
);
assert.equal(directSimulation.amountOut, expectedHop2);
assert.equal(directSimulation.profit, expectedHop2 - TEST_AMOUNT);
assert.equal(directSimulation.profitable, true);

const routeCache = new RouteCache(16);
const logs: Array<{ level: string | undefined; message: string; meta: any }> = [];
const getFreshTokenToMaticRate = (tokenAddress: string) => tokenAddress.toLowerCase() === WMATIC ? 1n : 0n;
const getRouteFreshnessForHarness = (path: any) =>
  getPathFreshness(path, stateCache, { maxAgeMs: 60_000, maxSkewMs: 60_000 });
const executionAttempts: any[] = [];

const search = createArbSearcher({
  cachedCycles: () => cycles,
  topologyDirty: () => false,
  refreshCycles: async () => {},
  passCount: () => 1,
  maxPathsToOptimize: 10,
  minProfitWei: MIN_PROFIT_WEI,
  stateCache,
  log: (message, level, meta) => {
    logs.push({ message, level, meta: normalizeLogMeta(meta) });
  },
  getCurrentFeeSnapshot: async () => ({ maxFee: GAS_PRICE_WEI, effectiveGasPriceWei: GAS_PRICE_WEI, updatedAt: Date.now() }),
  getFreshTokenToMaticRate,
  getRouteFreshness: getRouteFreshnessForHarness,
  getProbeAmountsForToken: () => [TEST_AMOUNT],
  evaluatePathsParallel: async (paths, cache, probeAmount) =>
    evaluatePaths(paths, cache, probeAmount, { optimize: false }),
  optimizeInputAmount,
  evaluateCandidatePipeline,
  partitionFreshCandidates,
  filterQuarantinedCandidates: (candidates) => candidates,
  routeCacheUpdate: (candidates) => routeCache.update(candidates),
  routeKeyFromEdges,
  fmtPath,
  fmtProfit: (profit) => profit.toString(),
  onPathsEvaluated: (count) => {
    assert.equal(count, cycles.length);
  },
  onCandidateMetrics: (metrics) => {
    assert.ok(metrics.topCandidates >= 1);
    assert.ok(metrics.profitableRoutes >= 1);
  },
  onArbsFound: (count) => {
    executionAttempts.push({ arbsFound: count });
  },
  workerCount: 1,
});

const profitable = await search();
assert.equal(profitable.length, 1, "search should return only the profitable direction");
assert.equal(profitable[0].assessment.shouldExecute, true);
assert.ok(profitable[0].assessment.netProfitAfterGas > 0n);
assert.equal(routeCache.size, 1, "profitable routes should be cached for watcher-triggered revalidation");
assert.equal(routeCache.getByPools(new Set([CHEAP_WMATIC_POOL])).length, 1);
assert.ok(logs.some((entry) => entry.meta?.event === "profitable_route"));
assert.deepEqual(executionAttempts, [{ arbsFound: 1 }]);

const execution = createExecutionCoordinator({
  liveMode: true,
  privateKey: TEST_PRIVATE_KEY,
  executorAddress: EXECUTOR,
  rpcUrl: "http://127.0.0.1:8545",
  getNonceManager: () => ({ next: async () => 0n }),
  maxExecutionBatch: 1,
  executionRouteQuarantineMs: 60_000,
  minProfitWei: MIN_PROFIT_WEI,
  log: (message, level, meta) => {
    logs.push({ message, level, meta: normalizeLogMeta(meta) });
  },
  fmtPath,
  getRouteFreshness: getRouteFreshnessForHarness,
  getCurrentFeeSnapshot: async () => ({
    maxFee: GAS_PRICE_WEI,
    maxFeePerGas: GAS_PRICE_WEI,
    maxPriorityFeePerGas: GAS_PRICE_WEI,
    effectiveGasPriceWei: GAS_PRICE_WEI,
    updatedAt: Date.now(),
  }),
  getFreshTokenToMaticRate,
  deriveOnChainMinProfit: (assessment, tokenToMaticRate) => {
    const minProfitTokens = minProfitInTokenUnits(tokenToMaticRate, MIN_PROFIT_WEI);
    const modeledNet = assessment?.netProfitAfterGas ?? 0n;
    const buffered = modeledNet > 0n ? modeledNet / 2n : 0n;
    return buffered > minProfitTokens ? buffered : minProfitTokens;
  },
  buildArbTx: (candidate, accounts, options) =>
    buildArbTx(candidate, accounts, {
      ...options,
      gasParamsOverride: {
        maxFeePerGas: GAS_PRICE_WEI,
        maxPriorityFeePerGas: GAS_PRICE_WEI,
        gasLimit: 120_000n,
        effectiveGasPriceWei: GAS_PRICE_WEI,
        estimatedCostWei: 120_000n,
        maxCostWei: 120_000n,
      },
    }),
  sendTx: async (tx, clientConfig, options) => {
    executionAttempts.push({ tx, clientConfig, options });
    return { submitted: true, hash: "0x" + "ef".repeat(32) };
  },
  sendTxBundle: async () => {
    throw new Error("single-route harness should not bundle");
  },
  hasPendingExecution: () => false,
  scalePriorityFeeByProfitMargin: (fees) => ({
    maxFeePerGas: fees.maxFeePerGas ?? fees.maxFee,
    maxPriorityFeePerGas: fees.maxPriorityFeePerGas ?? fees.maxFee,
  }),
});

const submission = await execution.executeBatchIfIdle(profitable, "engine_e2e_harness");
assert.deepEqual(submission, { submitted: true, hash: "0x" + "ef".repeat(32) });

const submitted = executionAttempts.find((entry) => entry.tx);
assert.ok(submitted, "profitable opportunity should reach the transaction submission seam");
assert.equal(submitted.tx.to.toLowerCase(), EXECUTOR);
assert.equal(submitted.tx.calls.length, 4, "two V2 hops should expand to transfer+swap calls per hop");
assert.equal(submitted.tx.meta.flashToken.toLowerCase(), WMATIC);
assert.equal(submitted.tx.meta.flashAmount, profitable[0].result.amountIn.toString());
assert.equal(submitted.options.awaitReceipt, false);
assert.equal(
  submitted.tx.meta.minProfit,
  undefined,
  "minProfit is enforced in calldata/flash params rather than duplicated in tx metadata",
);
assert.ok(BigInt(submitted.tx.flashParams.minProfit) > 0n);

const postBuildAssessment = assessRouteResult(
  profitable[0].path,
  { ...profitable[0].result, totalGas: Number(submitted.tx.gasLimit) },
  GAS_PRICE_WEI,
  getFreshTokenToMaticRate(WMATIC),
  { minProfitWei: MIN_PROFIT_WEI },
);
assert.equal(postBuildAssessment.shouldExecute, true, "post-build gas should not invalidate the submitted route");
assert.ok(logs.some((entry) => entry.meta?.event === "execute_drift_check"));

console.log("Engine end-to-end harness checks passed.");
