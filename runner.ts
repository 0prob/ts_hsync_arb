
/**
 * runner.js — Unified Arbitrage & Discovery Runner
 *
 * Architecture (event-driven):
 *   1. Bootstrap  — discover pools, seed stateCache from DB.
 *   2. HyperSync  — StateWatcher streams Sync/Swap/Mint/Burn/Balancer/Curve
 *                   events in real-time; each batch updates stateCache and
 *                   calls watcher.onBatch() → scheduleArb().
 *   3. Arb scan   — debounced: fires ≥200 ms after state change, coalesces
 *                   rapid batches into a single evaluation pass.
 *   4. Heartbeat  — backs up the event trigger: guarantees a scan at least
 *                   every HEARTBEAT_INTERVAL_MS even during quiet periods.
 *   5. Background — pool discovery repeats every DISCOVERY_INTERVAL_MS;
 *                   cycle topology rebuilds only when new pools are discovered.
 *
 * Flags:
 *   --loop            Stay alive after first arb scan (event-driven)
 *   --live            Execute found opportunities on-chain
 *   --discovery-only  Run pool discovery only, then exit
 *   --interval <sec>  Override poll/heartbeat interval (legacy; sets heartbeat)
 */

import { toFiniteNumber as normaliseLogWeight } from "./src/util/bigint.ts";
import { RegistryService } from "./src/db/registry.ts";
import { discoverPools } from "./src/discovery/discover.ts";
import { buildGraph, buildHubGraph, HUB_4_TOKENS, POLYGON_HUB_TOKENS, serializeTopology } from "./src/routing/graph.ts";
import { enumerateCycles, enumerateCyclesDual } from "./src/routing/enumerate_cycles.ts";
import { RouteCache } from "./src/routing/route_cache.ts";
import { evaluateCandidatePipeline } from "./src/routing/candidate_pipeline.ts";
import { routeKeyFromEdges } from "./src/routing/finder.ts";
import { partitionFreshCandidates } from "./src/routing/filter_fresh_candidates.ts";
import { getPathFreshness } from "./src/routing/path_freshness.ts";
import { evaluatePathsParallel, optimizeInputAmount, simulateRoute } from "./src/routing/simulator.ts";
import { workerPool } from "./src/routing/worker_pool.ts";
import { buildArbTx } from "./src/execution/build_tx.ts";
import { hasTrackedPendingTx, sendTx, sendTxBundle } from "./src/execution/send_tx.ts";
import { NonceManager } from "./src/execution/nonce_manager.ts";
import { clearGasEstimateCache, fetchEIP1559Fees, oracle as gasOracle, scalePriorityFeeByProfitMargin } from "./src/execution/gas.ts";
import { PriceOracle } from "./src/profit/price_oracle.ts";
import { StateWatcher } from "./src/state/watcher.ts";
import { validatePoolState, normalizePoolState } from "./src/state/normalizer.ts";
import { fetchMultipleV2States } from "./src/state/uniswap_v2.ts";
import { fetchMultipleV3States } from "./src/state/uniswap_v3.ts";
import { fetchAndNormalizeBalancerPool } from "./src/state/poll_balancer.ts";
import { fetchAndNormalizeCurvePool } from "./src/state/poll_curve.ts";
import { throttledMap } from "./src/enrichment/rpc.ts";
import { logger } from "./src/utils/logger.ts";
import {
  pathsEvaluated,
  arbsFound,
  candidateShortlistSize,
  candidateOptimizedCount,
  candidateProfitableCount,
  candidateProfitableYield,
  startMetricsServer,
  stopMetricsServer,
} from "./src/utils/metrics.ts";
import type { BotState } from "./src/tui/types.ts";
import { getPoolMetadata, getPoolTokens } from "./src/util/pool_record.ts";
import {
  assessRouteResult,
  compareAssessmentProfit,
  getAssessmentOptimizationOptions,
  minProfitInTokenUnits,
  type ArbPathLike,
  type AssessmentLike,
  type CandidateEntry,
  type ExecutableCandidate,
  type RouteResultLike,
} from "./src/arb/assessment.ts";
import { createExecutionCoordinator } from "./src/arb/execution_coordinator.ts";
import { createRouteRevalidator } from "./src/arb/route_revalidation.ts";
import { createArbSearcher, toRouteResultLike } from "./src/arb/search.ts";
import { createTopologyCache, type SerializedPathLike } from "./src/arb/topology_cache.ts";
import { createWarmupManager } from "./src/bootstrap/warmup.ts";
import { createDiscoveryCoordinator } from "./src/bootstrap/discovery.ts";
import { configureWatcherCallbacks, createArbScheduler, createShutdownHandler } from "./src/bootstrap/lifecycle.ts";
import {
  DB_PATH,
  POLYGON_RPC,
  DEFAULT_POLL_INTERVAL_SEC,
  MAX_CONSECUTIVE_ERRORS,
  MAX_TOTAL_PATHS,
  MAX_PATHS_TO_OPTIMIZE,
  DISCOVERY_INTERVAL_MS,
  WORKER_COUNT,
  EVAL_WORKER_THRESHOLD,
  V2_POLL_CONCURRENCY,
  V3_POLL_CONCURRENCY,
  ENRICH_CONCURRENCY,
  MAX_SYNC_WARMUP_POOLS,
  MAX_SYNC_WARMUP_V3_POOLS,
  ROUTE_STATE_MAX_AGE_MS,
  ROUTE_STATE_MAX_SKEW_MS,
  CYCLE_REFRESH_INTERVAL_MS,
  ENVIO_API_TOKEN,
} from "./src/config/index.ts";

type LogLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace";
type LogMeta = Record<string, unknown>;
type LogMetaInput = LogMeta | (() => LogMeta) | undefined;
type PoolRecord = {
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
// ─── CLI Arguments ─────────────────────────────────────────────

const args = process.argv.slice(2);
const LOOP_MODE       = args.includes("--loop");
const LIVE_MODE       = args.includes("--live");
const DISCOVERY_ONLY  = args.includes("--discovery-only");
const TUI_MODE        = args.includes("--tui");
const INTERVAL_IDX    = args.indexOf("--interval");
const POLL_INTERVAL_SEC =
  INTERVAL_IDX !== -1 ? parseInt(args[INTERVAL_IDX + 1], 10) : DEFAULT_POLL_INTERVAL_SEC;

// ─── Configuration ─────────────────────────────────────────────

const PRIVATE_KEY      = process.env.PRIVATE_KEY || null;
const EXECUTOR_ADDRESS = process.env.EXECUTOR_ADDRESS || null;
const MIN_PROFIT_WEI   = BigInt(process.env.MIN_PROFIT_WEI || "1000000000000000");
const TEST_AMOUNT_WEI  = 10n ** 18n; // 1 WMATIC / 1 WETH starting probe amount
const MAX_GAS_AGE_MS   = 10_000;
const MAX_PRICE_AGE_MS = 30_000;
const BASE_ARB_DEBOUNCE_MS = 200;
const FAST_ARB_DEBOUNCE_MS = 50;
const ARB_ACTIVITY_WINDOW_MS = 1_000;
const ARB_BURST_POOL_THRESHOLD = 10;
const SELECTIVE_4HOP_TOKEN_LIMIT = 4;
const SELECTIVE_4HOP_PATH_BUDGET = Math.max(500, Math.floor(MAX_TOTAL_PATHS * 0.15));
const SELECTIVE_4HOP_MAX_PATHS_PER_TOKEN = 1_000;
const MAX_EXECUTION_BATCH = 3;
const EXECUTION_ROUTE_QUARANTINE_MS = 120_000;

// Minimum ms between arb scans — coalesces rapid HyperSync batches.
const ARB_DEBOUNCE_MS = BASE_ARB_DEBOUNCE_MS;
// Fallback scan interval if no HyperSync events arrive (e.g. quiet market).
const HEARTBEAT_INTERVAL_MS = Math.max(POLL_INTERVAL_SEC * 1000, 30_000);

// ─── Globals ───────────────────────────────────────────────────

const stateCache  = new Map<string, Record<string, any>>();
const routeCache  = new RouteCache(1_000); // top-1000 profitable routes
let registry: RegistryService | null = null;
let watcher: StateWatcher | null = null;
let priceOracle: PriceOracle | null = null;
let nonceManager: NonceManager | null = null;
let stopTui: (() => void) | null = null;
let running       = true;
let cachedCycles: ArbPathLike[] = [];
// Two routing graphs: hubGraph (HUB_4_TOKENS only) + fullGraph (all pools).
// Both are rebuilt when new pools are discovered (topology change).
let hubGraph: any = null;
let fullGraph: any = null;
let topologyVersion = 0;
let topologyDirty = true;

let passCount          = 0;
let consecutiveErrors  = 0;

// Shared live state — the TUI polls this; the hot path never calls into tui/
const botState: BotState = {
  status: 'idle',
  passCount: 0,
  consecutiveErrors: 0,
  gasPrice: '0',
  maticPrice: 'N/A',
  lastArbMs: 0,
  opportunities: [],
  logs: [],
};

// Discovery
let lastCycleRefreshMs = 0;

// Cycle refresh reentrancy guard
let cycleRefreshRunning = false;

let _arbActivityWindow: Array<{ ts: number; changedPools: number }> = [];

// ─── TUI Setup ─────────────────────────────────────────────────

const runnerLogger: any = logger.child({ component: "runner" });
const rootLogger: any = logger;

function summarizeLogForTui(msg: string, payload: LogMeta | undefined) {
  const event = typeof payload?.event === "string" ? payload.event : null;
  if (!payload) return msg;

  const parts: string[] = [];
  if (event) parts.push(event);
  if (typeof payload.pass === "number") parts.push(`pass=${payload.pass}`);
  if (typeof payload.changedPools === "number") parts.push(`changed=${payload.changedPools}`);
  if (typeof payload.opportunities === "number") parts.push(`opps=${payload.opportunities}`);
  if (typeof payload.txHash === "string") parts.push(`tx=${payload.txHash.slice(0, 10)}`);

  return parts.length > 0 ? `${parts.join(" ")} | ${msg}` : msg;
}

function log(msg: string, level: LogLevel = "info", meta: LogMetaInput = undefined) {
  if (!runnerLogger.isLevelEnabled(level)) return;

  const payload = typeof meta === "function" ? meta() : meta;
  botState.logs.unshift(`[${level.toUpperCase()}] ${summarizeLogForTui(msg, payload)}`);
  if (botState.logs.length > 10) botState.logs.length = 10;

  if (payload && Object.keys(payload).length > 0) {
    runnerLogger[level](payload, msg);
    return;
  }
  runnerLogger[level](msg);
}

// ─── Helpers ───────────────────────────────────────────────────

const runnerSleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MIN_PROBE_AMOUNT = 1_000n;

function poolTokenList(pool: PoolRecord) {
  return getPoolTokens(pool);
}

function uniqueSortedBigInts(values: Array<string | number | bigint>) {
  return [...new Set(values.map(String))]
    .map((value) => BigInt(value))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function getProbeAmountsForToken(tokenAddress: string) {
  let decimals = registry?.getTokenMeta?.(tokenAddress)?.decimals;
  if (decimals == null) decimals = 18;

  const rawUnit = 10n ** BigInt(Math.max(0, Math.min(Number(decimals), 18)));
  const probes = uniqueSortedBigInts([
    MIN_PROBE_AMOUNT,
    rawUnit,
    rawUnit * 10n,
    rawUnit * 100n,
    TEST_AMOUNT_WEI,
  ]);

  return probes.filter((amount) => amount >= MIN_PROBE_AMOUNT);
}

const topologyCache = createTopologyCache(MAX_TOTAL_PATHS);

function roiForCandidate(result: RouteResultLike | null | undefined) {
  if (!result?.amountIn || result.amountIn <= 0n) return -Infinity;
  return Number((result.profit * 1_000_000n) / result.amountIn);
}

async function getCurrentFeeSnapshot() {
  try {
    const fees = await fetchEIP1559Fees();
    if (fees?.maxFee) {
      botState.gasPrice = (Number(fees.maxFee) / 1e9).toFixed(2);
    }
    if (!fees?.updatedAt || Date.now() - fees.updatedAt > MAX_GAS_AGE_MS) {
      return null;
    }
    return fees;
  } catch {
    return null;
  }
}

function getFreshTokenToMaticRate(tokenAddress: string) {
  return priceOracle?.getFreshRate?.(tokenAddress, MAX_PRICE_AGE_MS) ?? 0n;
}

function pruneArbActivityWindow(now = Date.now()) {
  _arbActivityWindow = _arbActivityWindow.filter((entry) => now - entry.ts <= ARB_ACTIVITY_WINDOW_MS);
}

function recordArbActivity(changedPools: number) {
  if (changedPools <= 0) return;
  const now = Date.now();
  pruneArbActivityWindow(now);
  _arbActivityWindow.push({ ts: now, changedPools });
}

function getAdaptiveDebounceMs() {
  const now = Date.now();
  pruneArbActivityWindow(now);
  const changedPools = _arbActivityWindow.reduce((total, entry) => total + entry.changedPools, 0);
  return changedPools > ARB_BURST_POOL_THRESHOLD ? FAST_ARB_DEBOUNCE_MS : BASE_ARB_DEBOUNCE_MS;
}

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
  const ranked = [...POLYGON_HUB_TOKENS]
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

  return ranked.slice(0, SELECTIVE_4HOP_TOKEN_LIMIT).map((entry) => entry.token);
}

function mergeArbPaths(...groups: ArbPathLike[][]) {
  const merged: ArbPathLike[] = [];
  const seen = new Set<string>();

  for (const group of groups) {
    for (const path of group) {
      const key = routeKeyFromEdges(path.startToken, path.edges as any);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(path);
    }
  }

  merged.sort((a, b) => normaliseLogWeight(a.logWeight) - normaliseLogWeight(b.logWeight));
  return merged.length > MAX_TOTAL_PATHS ? merged.slice(0, MAX_TOTAL_PATHS) : merged;
}

function deriveOnChainMinProfit(assessment: AssessmentLike | null | undefined, tokenToMaticRate: bigint) {
  const minProfitTokens = minProfitInTokenUnits(tokenToMaticRate, MIN_PROFIT_WEI);
  const modeledNet = assessment && assessment.netProfitAfterGas > 0n
    ? assessment.netProfitAfterGas
    : assessment?.netProfit ?? 0n;
  const buffered = modeledNet > 0n ? (modeledNet * 50n) / 100n : 0n;
  return buffered > minProfitTokens ? buffered : minProfitTokens;
}

function getRouteFreshness(path: ArbPathLike) {
  return getPathFreshness(path, stateCache, {
    maxAgeMs: ROUTE_STATE_MAX_AGE_MS,
    maxSkewMs: ROUTE_STATE_MAX_SKEW_MS,
  });
}

const executionCoordinator = createExecutionCoordinator({
  liveMode: LIVE_MODE,
  privateKey: PRIVATE_KEY,
  executorAddress: EXECUTOR_ADDRESS,
  rpcUrl: POLYGON_RPC,
  getNonceManager: () => nonceManager,
  maxExecutionBatch: MAX_EXECUTION_BATCH,
  executionRouteQuarantineMs: EXECUTION_ROUTE_QUARANTINE_MS,
  minProfitWei: MIN_PROFIT_WEI,
  log,
  fmtPath,
  getRouteFreshness,
  getCurrentFeeSnapshot,
  getFreshTokenToMaticRate,
  deriveOnChainMinProfit,
  buildArbTx,
  sendTx,
  sendTxBundle,
  hasPendingExecution: hasTrackedPendingTx,
  scalePriorityFeeByProfitMargin,
  onPreparedCandidateError: (candidate, reason, quarantine) => {
    log(`[runner] Quarantining route after execution preparation failure: ${reason}`, "warn", {
      event: "execute_quarantine_add",
      route: fmtPath(candidate.path),
      hopCount: candidate.path.hopCount,
      failures: quarantine.failures,
      quarantineMs: Math.max(0, quarantine.until - Date.now()),
      reason,
    });
  },
});

const {
  clearExecutionRouteQuarantine,
  executeBatchIfIdle,
  filterQuarantinedCandidates,
} = executionCoordinator;

const revalidateCachedRoutes = createRouteRevalidator({
  getAffectedRoutes: (changedPools) =>
    (routeCache.getByPools(changedPools) as Array<{ path: any; result: any }>).map(({ path, result }) => ({
      path: path as ArbPathLike,
      result: toRouteResultLike(result),
    })),
  stateCache,
  testAmountWei: TEST_AMOUNT_WEI,
  minProfitWei: MIN_PROFIT_WEI,
  maxExecutionBatch: MAX_EXECUTION_BATCH,
  log,
  getCurrentFeeSnapshot,
  getFreshTokenToMaticRate,
  getRouteFreshness,
  simulateRoute: (path, amountIn, cache) =>
    simulateRoute(path, amountIn, cache) as unknown as RouteResultLike,
  optimizeInputAmount: (path, cache, options) =>
    (optimizeInputAmount(path, cache, options) as unknown as RouteResultLike | null),
  filterQuarantinedCandidates,
  executeBatchIfIdle,
});

async function evaluateCandidatesMultiProbe(paths: ArbPathLike[]) {
  return [];
}

function formatDuration(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

function fmtSym(addr: string) {
  return registry?.getTokenMeta?.(addr)?.symbol ?? addr.slice(2, 8).toUpperCase();
}

function fmtPath(path: ArbPathLike) {
  const tokens = [path.startToken, ...path.edges.map(e => e.tokenOut)];
  const prots  = path.edges.map(e => e.protocol);
  return `${tokens.map(fmtSym).join('→')}  [${prots.join('/')}]`;
}

function fmtProfit(netWei: bigint, tokenAddr: string) {
  const meta = registry?.getTokenMeta?.(tokenAddr);
  const dec  = meta?.decimals ?? 18;
  const sym  = meta?.symbol   ?? tokenAddr.slice(2, 8).toUpperCase();
  return `${(Number(netWei) / 10 ** dec).toFixed(6)} ${sym}`;
}

function partitionChangedPools(changedPools: Set<string>) {
  const valid = new Set<string>();
  const invalid = new Set<string>();

  for (const addr of changedPools) {
    const state = stateCache.get(addr);
    const verdict = validatePoolState(state);
    if (verdict.valid) {
      valid.add(addr);
    } else {
      invalid.add(addr);
      rootLogger.debug(
        `[runner] Pool ${addr} is currently unroutable: ${verdict.reason ?? "invalid state"}`
      );
    }
  }

  return { valid, invalid };
}

function getRoutablePools(pools: PoolRecord[]) {
  return pools.filter((pool: PoolRecord) => {
    const addr = pool.pool_address.toLowerCase();
    return validatePoolState(stateCache.get(addr)).valid;
  });
}

function poolTouchesHubTokens(pool: PoolRecord, hubTokens: Set<string> = HUB_4_TOKENS) {
  const tokens = poolTokenList(pool);
  if (!tokens || tokens.length < 2) return false;
  return tokens.slice(0, 2).some((token) => hubTokens.has(token));
}

function admitPoolsToGraphs(poolAddresses: Set<string>) {
  if (!fullGraph || !hubGraph || !poolAddresses || poolAddresses.size === 0) return 0;

  let admitted = 0;
  for (const addr of poolAddresses) {
    if (fullGraph._edgesByPool.has(addr)) continue;

    const pool = registry?.getPoolMeta(addr);
    if (!pool || pool.status !== "active") continue;

    fullGraph.addPool(pool, stateCache);
    if (fullGraph._edgesByPool.has(addr)) {
      admitted++;
      if (poolTouchesHubTokens(pool)) {
        hubGraph.addPool(pool, stateCache);
      }
    }
  }

  return admitted;
}

function removePoolsFromGraphs(poolAddresses: Set<string>) {
  if (!fullGraph || !hubGraph || !poolAddresses || poolAddresses.size === 0) return 0;

  let removed = 0;
  for (const addr of poolAddresses) {
    removed += fullGraph.removePool(addr);
    hubGraph.removePool(addr);
  }

  return removed;
}

const warmupManager = createWarmupManager({
  getRegistry: () => registry,
  stateCache,
  log,
  getPoolTokens,
  getPoolMetadata,
  validatePoolState,
  normalizePoolState,
  fetchMultipleV2States,
  fetchMultipleV3States: fetchMultipleV3States as any,
  fetchAndNormalizeBalancerPool,
  fetchAndNormalizeCurvePool,
  throttledMap,
  polygonHubTokens: POLYGON_HUB_TOKENS,
  hub4Tokens: HUB_4_TOKENS,
  maxSyncWarmupPools: MAX_SYNC_WARMUP_POOLS,
  maxSyncWarmupV3Pools: MAX_SYNC_WARMUP_V3_POOLS,
  v2PollConcurrency: V2_POLL_CONCURRENCY,
  v3PollConcurrency: V3_POLL_CONCURRENCY,
  enrichConcurrency: ENRICH_CONCURRENCY,
});

const seedStateCache = warmupManager.seedStateCache;
const warmupStateCache = warmupManager.warmupStateCache;
const _fetchAndCacheStates = warmupManager.fetchAndCacheStates;
const discoveryCoordinator = createDiscoveryCoordinator({
  discoverPools,
  log,
  discoveryIntervalMs: DISCOVERY_INTERVAL_MS,
});
const maybeRunDiscovery = discoveryCoordinator.maybeRunDiscovery;
const { scheduleArb, cancelScheduledArb } = createArbScheduler({
  isRunning: () => running,
  recordArbActivity,
  getAdaptiveDebounceMs,
  runPass: () => runPass(),
});

// ─── Cycle enumeration ────────────────────────────────────────

async function refreshCycles(force = false) {
  // Skip if already built and not forced — graph state stays live via stateRefs.
  // Only rebuild topology (force=true) when new pools are discovered.
  const now = Date.now();
  const intervalElapsed =
    lastCycleRefreshMs <= 0 || now - lastCycleRefreshMs >= CYCLE_REFRESH_INTERVAL_MS;
  if (!force && !topologyDirty && cachedCycles.length > 0 && !intervalElapsed) return;

  // Prevent concurrent rebuilds: a second caller would clobber cachedCycles /
  // hubGraph mid-iteration.  The forced flag is preserved so the next call
  // after the in-flight one finishes will still do a full rebuild if needed.
  if (cycleRefreshRunning) {
    if (force) topologyDirty = true;
    return;
  }
  cycleRefreshRunning = true;

  try {
  log("Refreshing cycle enumeration...", "info", {
    event: "cycle_refresh_start",
    forced: force,
    topologyVersion: topologyVersion + 1,
  });
  const activePools = registry?.getActivePoolsMeta() ?? [];
  const pools = getRoutablePools(activePools);
  log(
    `Routing universe: ${pools.length} routable / ${activePools.length} active pools`,
    "info",
    {
      event: "routing_universe",
      activePools: activePools.length,
      routablePools: pools.length,
    }
  );

  const rebuildGraphs = force || !fullGraph || !hubGraph || intervalElapsed;

  // Build graphs only when absent or explicitly forced. For watcher-driven
  // admissions/removals we mutate the live graphs in place and only need
  // to re-enumerate cycles against the updated adjacency.
  if (rebuildGraphs) {
    fullGraph = buildGraph(pools, stateCache);
    hubGraph  = buildHubGraph(pools, HUB_4_TOKENS, stateCache);
    topologyCache.invalidateSerializedTopologies();
    clearGasEstimateCache();
    if (force || topologyDirty) {
      clearExecutionRouteQuarantine("topology_changed");
    }
  }
  const topologyKeyBase = `topology:${++topologyVersion}`;

  // $5k USD ≈ 7 143 WMATIC ≈ 7_143n * 10n**18n at $0.70/WMATIC
  const MIN_LIQ_WMATIC = 7_143n * 10n ** 18n;

  if (priceOracle && !priceOracle.isFresh(MAX_PRICE_AGE_MS)) {
    priceOracle.update();
  }
  // getRateWei bridges priceOracle into the enumerate options
  const getRateWei = priceOracle
    ? ((oracle: PriceOracle) => (addr: string) => oracle.getFreshRate(addr, MAX_PRICE_AGE_MS))(priceOracle)
    : null;
  const selective4HopTokens = selectHighLiquidityHubTokens(fullGraph, getRateWei);

  if (WORKER_COUNT >= 2 && (workerPool as any)._initialized) {
    // Offload enumeration to workers: split HUB_4_TOKENS tokens across threads
    const hubTopo    = topologyCache.getSerializedTopologyCached("hub", hubGraph, serializeTopology);
    const fullTopo   = topologyCache.getSerializedTopologyCached("full", fullGraph, serializeTopology);
    const hubTokens  = [...HUB_4_TOKENS].filter((t) => hubGraph.hasToken(t));
    // Full-graph enumeration starts only from POLYGON_HUB_TOKENS to bound search space
    const fullTokens = [...POLYGON_HUB_TOKENS].filter((t) => fullGraph.hasToken(t));

    const [hubSer, fullSer, selective4HopSer] = await Promise.all([
      workerPool.enumerate(hubTopo, hubTokens, {
        include2Hop: true, include3Hop: true, include4Hop: true,
        maxPathsPerToken: Math.ceil(MAX_TOTAL_PATHS * 0.5 / Math.max(hubTokens.length, 1)),
        max4HopPathsPerToken: 2_000,
        topologyKey: `${topologyKeyBase}:hub`,
      }),
      workerPool.enumerate(fullTopo, fullTokens, {
        include2Hop: true, include3Hop: true, include4Hop: false,
        maxPathsPerToken: Math.ceil(MAX_TOTAL_PATHS * 0.35 / Math.max(fullTokens.length, 1)),
        topologyKey: `${topologyKeyBase}:full`,
      }),
      selective4HopTokens.length > 0
        ? workerPool.enumerate(fullTopo, selective4HopTokens, {
            include2Hop: true,
            include3Hop: true,
            include4Hop: true,
            maxPathsPerToken: Math.min(
              SELECTIVE_4HOP_MAX_PATHS_PER_TOKEN,
              Math.ceil(SELECTIVE_4HOP_PATH_BUDGET / Math.max(selective4HopTokens.length, 1)),
            ),
            max4HopPathsPerToken: SELECTIVE_4HOP_MAX_PATHS_PER_TOKEN,
            topologyKey: `${topologyKeyBase}:full_selective_4hop`,
          })
        : Promise.resolve([]),
    ]);

    // Re-hydrate serialised paths back to full edge objects from live graphs
    cachedCycles = mergeArbPaths(
      topologyCache.hydratePaths(hubSer, hubGraph, fullGraph),
      topologyCache.hydratePaths(fullSer, hubGraph, fullGraph),
      topologyCache.hydratePaths(selective4HopSer, hubGraph, fullGraph),
    );
  } else {
    // Synchronous enumeration on main thread
    const baseCycles = enumerateCyclesDual(hubGraph, fullGraph, {
      include2Hop:          true,
      include3Hop:          true,
      maxPathsPerToken:     Math.ceil(MAX_TOTAL_PATHS / 7),
      max4HopPathsPerToken: 2_000,
      maxTotalPaths:        MAX_TOTAL_PATHS,
      minLiquidityWmatic:   getRateWei ? MIN_LIQ_WMATIC : 0n,
      getRateWei,
    });
    const selective4HopCycles = selective4HopTokens.length > 0
      ? enumerateCycles(fullGraph, {
          startTokens: new Set(selective4HopTokens),
          include2Hop: true,
          include3Hop: true,
          include4Hop: true,
          maxPathsPerToken: Math.min(
            SELECTIVE_4HOP_MAX_PATHS_PER_TOKEN,
            Math.ceil(SELECTIVE_4HOP_PATH_BUDGET / Math.max(selective4HopTokens.length, 1)),
          ),
          max4HopPathsPerToken: SELECTIVE_4HOP_MAX_PATHS_PER_TOKEN,
          maxTotalPaths: SELECTIVE_4HOP_PATH_BUDGET,
          minLiquidityWmatic: getRateWei ? MIN_LIQ_WMATIC : 0n,
          getRateWei,
        })
      : [];
    cachedCycles = mergeArbPaths(baseCycles, selective4HopCycles);
  }

  // Prune stale cached routes after topology rebuild
  routeCache.prune(stateCache);
  topologyDirty = false;
  lastCycleRefreshMs = Date.now();

  log(`Cycle refresh: ${cachedCycles.length} paths (hub+full, max ${MAX_TOTAL_PATHS}).`, "info", {
    event: "cycle_refresh_complete",
    forced: force,
    topologyVersion,
    cachedPaths: cachedCycles.length,
    maxTotalPaths: MAX_TOTAL_PATHS,
    selective4HopTokens: selective4HopTokens.length,
    routeCacheSize: routeCache.routes.length,
  });
  } finally {
    cycleRefreshRunning = false;
  }
}

// ─── Arb search ────────────────────────────────────────────────

const findArbs = createArbSearcher({
  cachedCycles: () => cachedCycles,
  topologyDirty: () => topologyDirty,
  refreshCycles,
  passCount: () => passCount,
  maxPathsToOptimize: MAX_PATHS_TO_OPTIMIZE,
  minProfitWei: MIN_PROFIT_WEI,
  stateCache,
  log,
  getCurrentFeeSnapshot,
  getFreshTokenToMaticRate,
  getRouteFreshness,
  getProbeAmountsForToken,
  evaluatePathsParallel,
  optimizeInputAmount: (path, cache, options) =>
    optimizeInputAmount(path, cache, options) as unknown as RouteResultLike | null,
  evaluateCandidatePipeline,
  partitionFreshCandidates,
  filterQuarantinedCandidates,
  routeCacheUpdate: (candidates) => routeCache.update(candidates),
  routeKeyFromEdges,
  fmtPath,
  fmtProfit,
  onPathsEvaluated: (count) => pathsEvaluated.inc({ pass: passCount }, count),
  onCandidateMetrics: ({ topCandidates, optimizedCandidates, profitableRoutes }) => {
    candidateShortlistSize.observe(topCandidates);
    candidateOptimizedCount.observe(optimizedCandidates);
    candidateProfitableCount.observe(profitableRoutes);
    candidateProfitableYield.observe(topCandidates > 0 ? profitableRoutes / topCandidates : 0);
  },
  onArbsFound: (count) => arbsFound.inc({ pass: passCount }, count),
  workerCount: WORKER_COUNT,
});

// ─── Arb pass ──────────────────────────────────────────────────

async function runPass() {
  const t0 = Date.now();
  passCount++;
  log(`Pass #${passCount} — state: ${stateCache.size} pools, paths: ${cachedCycles.length}`, "info", {
    event: "pass_start",
    pass: passCount,
    stateSize: stateCache.size,
    cachedPaths: cachedCycles.length,
  });

  try {
    // Background discovery (non-blocking, self-throttled)
    maybeRunDiscovery().then(async (result: any) => {
      if (result?.totalDiscovered > 0) {
        // Seed stateCache for new pools and extend the HyperSync stream filter
        const allPools = registry?.getActivePoolsMeta() ?? [];
        const newPools = allPools.filter(
          (p: PoolRecord) => !stateCache.has(p.pool_address.toLowerCase())
        );
        if (newPools.length > 0) {
          for (const p of newPools) {
            const pAddr = p.pool_address.toLowerCase();
            let pTokens;
            try {
              pTokens = typeof p.tokens === "string" ? JSON.parse(p.tokens) : p.tokens;
            } catch { pTokens = []; }
            stateCache.set(pAddr, {
              poolId: pAddr,
              protocol: p.protocol,
              tokens: Array.isArray(pTokens) ? pTokens.map((t) => t.toLowerCase()) : [],
              timestamp: 0,
            });
          }
          if (watcher) {
            watcher.addPools(newPools.map((p: PoolRecord) => p.pool_address.toLowerCase()));
          }
          // Fetch live state for newly discovered pools before rebuilding topology
          await _fetchAndCacheStates(newPools);
        }
        // Rebuild cycle topology with the new pool set
        topologyDirty = true;
        await refreshCycles(true);
      }
    }).catch((err: any) => {
      log(`Background discovery error: ${err?.message ?? err}`, "warn", {
        event: "discovery_bg_error",
        err,
      });
    });

    // Refresh cycles if not yet built
    await refreshCycles();

    // Update price oracle from live state only when stale; watcher batches do incremental refreshes.
    if (priceOracle && !priceOracle.isFresh(MAX_PRICE_AGE_MS)) {
      priceOracle.update();
    }

    const opportunities = await findArbs();
    botState.passCount         = passCount;
    botState.consecutiveErrors = consecutiveErrors;
    botState.opportunities     = opportunities.slice(0, 5).map((o: CandidateEntry) => ({
      Route:  o.path.edges.map(e => e.protocol).join(' -> '),
      Profit: `${(Number(o.result.profit) / 1e18).toFixed(4)} MATIC`,
      ROI:    `${(roiForCandidate(o.result) / 10000).toFixed(2)}%`,
    }));
    log(`Pass #${passCount}: ${opportunities.length} profitable route(s)`, "info", {
      event: "pass_opportunities",
      pass: passCount,
      opportunities: opportunities.length,
      stateSize: stateCache.size,
      cachedPaths: cachedCycles.length,
      lastPass: formatDuration(Date.now() - t0),
    });

    if (opportunities.length > 0) {
      log("Executing top opportunity set...", "info", {
        event: "pass_execute_best",
        pass: passCount,
        opportunities: Math.min(opportunities.length, MAX_EXECUTION_BATCH),
      });
      await executeBatchIfIdle(opportunities.slice(0, MAX_EXECUTION_BATCH), "run_pass");
    }

    log(`Pass #${passCount} complete in ${formatDuration(Date.now() - t0)}`, "info", {
      event: "pass_complete",
      pass: passCount,
      durationMs: Date.now() - t0,
      opportunities: opportunities.length,
    });
    consecutiveErrors = 0;
  } catch (err: any) {
    log(`Pass #${passCount} failed: ${err.message}`, "error", {
      event: "pass_failed",
      pass: passCount,
      consecutiveErrors: consecutiveErrors + 1,
      err,
    });
    consecutiveErrors++;
    if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
      log(`${MAX_CONSECUTIVE_ERRORS} consecutive errors — backing off 30s`, "warn");
      await runnerSleep(30_000);
      consecutiveErrors = 0;
    }
  }
}

// ─── Debounced arb trigger ────────────────────────────────────

// ─── Shutdown ──────────────────────────────────────────────────
const shutdown = createShutdownHandler({
  log,
  setRunning: (next) => { running = next; },
  stopTui: () => {
    stopTui?.();
    stopTui = null;
  },
  getWatcher: () => watcher,
  gasOracle,
  getRegistry: () => registry,
  workerPool,
  stopMetricsServer,
  cancelScheduledArb,
  exit: (code) => process.exit(code),
});

// ─── Main ──────────────────────────────────────────────────────

async function main() {
  botState.status = 'running';

  if (TUI_MODE) {
    const { startTui } = await import("./src/tui/index.tsx");
    stopTui = startTui(botState);
  } else {
    startMetricsServer(9090);
    console.log("╔══════════════════════════════════════════════╗");
    console.log("║   Polygon Arbitrage Bot — Event-Driven       ║");
    console.log(`║   Workers: ${String(WORKER_COUNT).padEnd(3)}  Paths: ${String(MAX_TOTAL_PATHS).padEnd(7)}          ║`);
    console.log("╚══════════════════════════════════════════════╝");
  }

  registry     = new RegistryService(DB_PATH);
  priceOracle  = new PriceOracle(stateCache, registry);
  nonceManager = new NonceManager();

  process.on("SIGINT",  shutdown);
  process.on("SIGTERM", shutdown);

  // Init worker pool early so workers are warm before first arb scan
  if (WORKER_COUNT >= 2) {
    workerPool.init();
    log(`Worker pool: ${WORKER_COUNT} threads (threshold: ${EVAL_WORKER_THRESHOLD} paths)`);
  }

  // Discover pools at startup (blocking — ensures registry is populated)
  await discoveryCoordinator.runInitialDiscovery();

  // Seed stateCache from the registry's persisted state
  seedStateCache();

  // Fetch live on-chain state for hub pools before the first cycle build.
  // Non-hub pools are fetched in the background and admitted incrementally.
  await warmupStateCache();

  // Initial cycle enumeration
  await refreshCycles(true);

  // Post-warmup sanity check: if no paths were found the hub-pair state is
  // entirely missing (RPC failures or empty DB).  The watcher replay will
  // still populate state incrementally, but warn so the operator knows.
  if (cachedCycles.length === 0) {
    log(
      "Post-warmup: 0 arbitrage paths enumerated. " +
      "Hub-pair pools may be unavailable or RPC failed. " +
      "Watcher replay will populate state incrementally.",
      "warn",
      { event: "warmup_no_paths" }
    );
  }

  // ── Single-shot mode ─────────────────────────────────────────
  if (!LOOP_MODE) {
    if (!DISCOVERY_ONLY) await runPass();
    await shutdown();
    return;
  }

  // ── Event-driven loop (--loop) ────────────────────────────────
  //
  // The StateWatcher fires watcher.onBatch() after each HyperSync batch.
  // scheduleArb() debounces those callbacks into arb scans.
  // A heartbeat timer ensures scans happen even during quiet market periods.

  if (!ENVIO_API_TOKEN) {
    throw new Error("ENVIO_API_TOKEN is required for --loop watcher mode");
  }

  watcher = new StateWatcher(registry, stateCache);

  configureWatcherCallbacks({
    watcher,
    log,
    partitionChangedPools,
    removePoolsFromGraphs,
    routeCache,
    topologyCache,
    setTopologyDirty: (dirty) => { topologyDirty = dirty; },
    admitPoolsToGraphs,
    priceOracle,
    revalidateCachedRoutes,
    scheduleArb,
    setCachedCycles: (cycles) => { cachedCycles = cycles; },
    resetGraphs: () => {
      hubGraph = null;
      fullGraph = null;
    },
  });

  log(`Starting HyperSync stream (debounce: ${FAST_ARB_DEBOUNCE_MS}-${BASE_ARB_DEBOUNCE_MS}ms adaptive, heartbeat: ${formatDuration(HEARTBEAT_INTERVAL_MS)})...`, "info", {
    event: "watcher_start",
    debounceMs: BASE_ARB_DEBOUNCE_MS,
    fastDebounceMs: FAST_ARB_DEBOUNCE_MS,
    heartbeatMs: HEARTBEAT_INTERVAL_MS,
  });
      await watcher.start(undefined);

  // Heartbeat: guarantee a scan even if the market is quiet
  const heartbeat = setInterval(scheduleArb, HEARTBEAT_INTERVAL_MS);

  // Run one pass immediately so we don't wait for the first event
  scheduleArb();

  // Block until watcher stops (stop() resolves _loopPromise)
  await watcher.wait();
  clearInterval(heartbeat);
}

main().catch((err: any) => {
  rootLogger.fatal({ event: "main_fatal", err }, "Fatal error");
  process.exit(1);
});
