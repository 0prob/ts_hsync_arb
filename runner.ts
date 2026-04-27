
/**
 * runner.ts — Unified Arbitrage & Discovery Runner
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
 */

import { RegistryService } from "./src/db/registry.ts";
import { discoverPools } from "./src/discovery/discover.ts";
import { buildGraph, buildHubGraph, HUB_4_TOKENS, POLYGON_HUB_TOKENS, serializeTopology } from "./src/routing/graph.ts";
import { enumerateCycles, enumerateCyclesDual } from "./src/routing/enumerate_cycles.ts";
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
import { roiMicroUnits } from "./src/profit/compute.ts";
import { StateWatcher } from "./src/state/watcher.ts";
import { validatePoolState, normalizePoolState } from "./src/state/normalizer.ts";
import { fetchMultipleV2States } from "./src/state/uniswap_v2.ts";
import { fetchMultipleV3States } from "./src/state/uniswap_v3.ts";
import { fetchAndNormalizeBalancerPool } from "./src/state/poll_balancer.ts";
import { fetchAndNormalizeCurvePool } from "./src/state/poll_curve.ts";
import { fetchAndNormalizeDodoPool } from "./src/state/poll_dodo.ts";
import { fetchAndNormalizeWoofiPool } from "./src/state/poll_woofi.ts";
import { throttledMap } from "./src/enrichment/rpc.ts";
import { logger } from "./src/utils/logger.ts";
import type { Logger as PinoLogger } from "pino";
import {
  pathsEvaluated,
  arbsFound,
  candidateShortlistSize,
  candidateOptimizedCount,
  candidateProfitableCount,
  candidateProfitableYield,
  recordWatcherHalt,
  setWatcherHealthy,
  startMetricsServer,
  stopMetricsServer,
} from "./src/utils/metrics.ts";
import { getPoolMetadata, getPoolTokens } from "./src/util/pool_record.ts";
import {
  minProfitInTokenUnits,
  type ArbPathLike,
  type AssessmentLike,
  type CandidateEntry,
  type RouteResultLike,
} from "./src/arb/assessment.ts";
import { createOpportunityEngine } from "./src/arb/opportunity_engine.ts";
import { createWarmupManager, isSupportedWarmupProtocol } from "./src/bootstrap/warmup.ts";
import { createDiscoveryCoordinator } from "./src/bootstrap/discovery.ts";
import { parseRunnerArgs } from "./src/bootstrap/cli.ts";
import { configureWatcherCallbacks, createArbScheduler, createShutdownHandler } from "./src/bootstrap/lifecycle.ts";
import { createRuntimeContext } from "./src/runtime/runtime_context.ts";
import { createTopologyService } from "./src/runtime/topology_service.ts";
import { createPricingService } from "./src/runtime/pricing_service.ts";
import { createBackgroundTaskTracker } from "./src/runtime/background_tasks.ts";
import { createDiscoveryRefreshCoordinator } from "./src/runtime/discovery_refresh.ts";
import { createQuietPoolSweepCoordinator } from "./src/runtime/quiet_pool_sweep.ts";
import { createTopologyRefreshCoordinator } from "./src/runtime/topology_refresh.ts";
import { createWatcherBatchCoordinator } from "./src/runtime/watcher_batch.ts";
import { createReorgRecoveryCoordinator } from "./src/runtime/reorg_recovery.ts";
import { createWatcherHaltCoordinator } from "./src/runtime/watcher_halt.ts";
import { createStartupCoordinator } from "./src/runtime/startup.ts";
import { createBootModeCoordinator } from "./src/runtime/boot_mode.ts";
import { createPassRunner } from "./src/runtime/pass_runner.ts";
import { createRegistryRepositories } from "./src/db/repositories.ts";
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
  MAX_SYNC_WARMUP_ONE_HUB_POOLS,
  V3_NEARBY_WORD_RADIUS,
  QUIET_POOL_SWEEP_BATCH_SIZE,
  QUIET_POOL_SWEEP_INTERVAL_MS,
  ROUTE_STATE_MAX_AGE_MS,
  ROUTE_STATE_MAX_SKEW_MS,
  CYCLE_REFRESH_INTERVAL_MS,
  SELECTIVE_4HOP_TOKEN_LIMIT,
  SELECTIVE_4HOP_PATH_BUDGET,
  SELECTIVE_4HOP_MAX_PATHS_PER_TOKEN,
  ROUTING_MAX_HOPS,
  ROUTING_CYCLE_MODE,
  ENVIO_API_TOKEN,
} from "./src/config/index.ts";

type LogLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace";
type LogMeta = Record<string, unknown>;
type LogMetaInput = LogMeta | (() => LogMeta) | unknown;
type ExecutionQuarantine = { failures: number; until: number };
type PoolRecord = {
  pool_address: string;
  protocol: string;
  tokens: unknown;
  metadata?: unknown;
  status?: string;
  state?: { data?: Record<string, unknown> };
};
// ─── CLI Arguments ─────────────────────────────────────────────

const args = process.argv.slice(2);
const parsedArgs = parseRunnerArgs(args, DEFAULT_POLL_INTERVAL_SEC);
const LOOP_MODE      = parsedArgs.loopMode;
const LIVE_MODE      = parsedArgs.liveMode;
const DISCOVERY_ONLY = parsedArgs.discoveryOnly;
const TUI_MODE       = parsedArgs.tuiMode;
const POLL_INTERVAL_SEC = parsedArgs.pollIntervalSec;

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
const MAX_EXECUTION_BATCH = 3;
const EXECUTION_ROUTE_QUARANTINE_MS = 120_000;

// Fallback scan interval if no HyperSync events arrive (e.g. quiet market).
const HEARTBEAT_INTERVAL_MS = Math.max(POLL_INTERVAL_SEC * 1000, 30_000);

// ─── Globals ───────────────────────────────────────────────────

let registry: RegistryService | null = null;
let stopTui: (() => void) | null = null;

// Shared live state — the TUI polls this; the hot path never calls into tui/
const runtime = createRuntimeContext({
  routeCacheSize: 1_000,
  initialBotState: {
  status: 'idle',
  passCount: 0,
  consecutiveErrors: 0,
  gasPrice: '0',
  maticPrice: 'N/A',
  lastArbMs: 0,
  opportunities: [],
  logs: [],
  },
});

const { stateCache, routeCache, botState } = runtime;

let _arbActivityWindow: Array<{ ts: number; changedPools: number }> = [];
const QUIET_POOL_RETRY_BASE_MS = 2 * 60_000;
const QUIET_POOL_RETRY_MAX_MS = 30 * 60_000;

// ─── TUI Setup ─────────────────────────────────────────────────

const runnerLogger: PinoLogger = logger.child({ component: "runner" });
const rootLogger: PinoLogger = logger;
let repositories: ReturnType<typeof createRegistryRepositories> | null = null;
let topologyService: ReturnType<typeof createTopologyService> | null = null;
let opportunityEngine: ReturnType<typeof createOpportunityEngine> | null = null;
let passRunner: ReturnType<typeof createPassRunner> | null = null;

function summarizeLogForTui(msg: string, payload: LogMeta | undefined) {
  const event = typeof payload?.event === "string" ? payload.event : null;
  if (!payload) return msg;

  const parts: string[] = [];
  if (event) parts.push(event);
  if (typeof payload.pass === "number") parts.push(`pass=${payload.pass}`);
  if (typeof payload.changedPools === "number") parts.push(`changed=${payload.changedPools}`);
  if (typeof payload.opportunities === "number") parts.push(`opps=${payload.opportunities}`);
  if (typeof payload.candidates === "number") parts.push(`candidates=${payload.candidates}`);
  if (typeof payload.topCandidates === "number") parts.push(`top=${payload.topCandidates}`);
  if (typeof payload.profitableRoutes === "number") parts.push(`profitable=${payload.profitableRoutes}`);
  if (typeof payload.missingTokenRates === "number" && payload.missingTokenRates > 0) {
    parts.push(`missingRates=${payload.missingTokenRates}`);
  }
  const assessmentSummary = payload.assessmentSummary;
  if (assessmentSummary && typeof assessmentSummary === "object" && !Array.isArray(assessmentSummary)) {
    const summary = assessmentSummary as Record<string, unknown>;
    if (typeof summary.assessed === "number") parts.push(`assessed=${summary.assessed}`);
    if (typeof summary.rejected === "number") parts.push(`rejected=${summary.rejected}`);
    if (typeof summary.missingTokenRates === "number" && summary.missingTokenRates > 0) {
      parts.push(`missingRates=${summary.missingTokenRates}`);
    }
    const rejectReasons = summary.rejectReasons;
    if (rejectReasons && typeof rejectReasons === "object" && !Array.isArray(rejectReasons)) {
      const [reason, count] = Object.entries(rejectReasons as Record<string, unknown>)
        .sort((a, b) => Number(b[1] ?? 0) - Number(a[1] ?? 0))[0] ?? [];
      if (reason && typeof count === "number" && count > 0) parts.push(`topReject=${reason}:${count}`);
    }
  }
  const rejectReasons = payload.rejectReasons;
  if (rejectReasons && typeof rejectReasons === "object" && !Array.isArray(rejectReasons)) {
    const [reason, count] = Object.entries(rejectReasons as Record<string, unknown>)
      .sort((a, b) => Number(b[1] ?? 0) - Number(a[1] ?? 0))[0] ?? [];
    if (reason && typeof count === "number" && count > 0) parts.push(`topReject=${reason}:${count}`);
  }
  if (typeof payload.txHash === "string") parts.push(`tx=${payload.txHash.slice(0, 10)}`);

  return parts.length > 0 ? `${parts.join(" ")} | ${msg}` : msg;
}

function normalizeLogMeta(meta: LogMetaInput): LogMeta | undefined {
  const resolved = typeof meta === "function" ? meta() : meta;
  if (!resolved || typeof resolved !== "object" || Array.isArray(resolved)) return undefined;
  return resolved as LogMeta;
}

function log(msg: string, level: LogLevel = "info", meta: LogMetaInput = undefined) {
  if (!runnerLogger.isLevelEnabled(level)) return;

  const payload = normalizeLogMeta(meta);
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
function roiForCandidate(candidate: CandidateEntry | null | undefined) {
  const assessedRoi = candidate?.assessment?.roi;
  if (typeof assessedRoi === "number" && Number.isFinite(assessedRoi)) {
    return assessedRoi;
  }

  const result = candidate?.result;
  if (!result?.amountIn || result.amountIn <= 0n) return -Infinity;
  return roiMicroUnits(result.profit, result.amountIn);
}

async function getCurrentFeeSnapshot() {
  try {
    const fees = await fetchEIP1559Fees();
    const displayGasPrice = fees?.effectiveGasPriceWei ?? fees?.maxFee;
    if (displayGasPrice) {
      botState.gasPrice = (Number(displayGasPrice) / 1e9).toFixed(2);
    }
    if (!fees?.updatedAt || Date.now() - fees.updatedAt > MAX_GAS_AGE_MS) {
      return null;
    }
    return fees;
  } catch {
    return null;
  }
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

function formatDuration(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

const pricingService = createPricingService({
  getTokenMeta: (tokenAddress: string) => repositories?.tokens.getMeta(tokenAddress),
  getPriceOracle: () => runtime.getPriceOracle(),
  maxPriceAgeMs: MAX_PRICE_AGE_MS,
  minProbeAmount: MIN_PROBE_AMOUNT,
  testAmountWei: TEST_AMOUNT_WEI,
});

function fmtPath(path: ArbPathLike) {
  const tokens = [path.startToken, ...path.edges.map(e => e.tokenOut)];
  const prots  = path.edges.map(e => e.protocol);
  return `${tokens.map((token) => pricingService.fmtSym(token)).join('→')}  [${prots.join('/')}]`;
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
  fetchAndNormalizeCurvePool: (pool: PoolRecord) =>
    fetchAndNormalizeCurvePool(pool, {
      tokenDecimals: registry?.getTokenDecimals(getPoolTokens(pool)) ?? null,
    }),
  fetchAndNormalizeDodoPool: (pool: PoolRecord) =>
    fetchAndNormalizeDodoPool(pool, {
      tokenDecimals: registry?.getTokenDecimals(getPoolTokens(pool)) ?? null,
    }),
  fetchAndNormalizeWoofiPool: (pool: PoolRecord) =>
    fetchAndNormalizeWoofiPool(pool, {
      tokenDecimals: registry?.getTokenDecimals(getPoolTokens(pool)) ?? null,
    }),
  throttledMap,
  polygonHubTokens: POLYGON_HUB_TOKENS,
  hub4Tokens: HUB_4_TOKENS,
  maxSyncWarmupPools: MAX_SYNC_WARMUP_POOLS,
  maxSyncWarmupV3Pools: MAX_SYNC_WARMUP_V3_POOLS,
  maxSyncWarmupOneHubPools: MAX_SYNC_WARMUP_ONE_HUB_POOLS,
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
const backgroundTaskTracker = createBackgroundTaskTracker();
const trackBackgroundTask = backgroundTaskTracker.track;
const waitForBackgroundTasks = backgroundTaskTracker.waitForIdle;
const quietPoolSweepCoordinator = createQuietPoolSweepCoordinator({
  getRegistryPools: () => registry?.getActivePoolsMeta() ?? [],
  stateCache,
  log,
  isHydratablePool: (pool: PoolRecord) => isSupportedWarmupProtocol(pool.protocol),
  validatePoolState,
  fetchAndCacheStates: _fetchAndCacheStates,
  admitPools: (poolAddresses: Set<string>) => topologyService?.admitPools(poolAddresses) ?? 0,
  refreshCycles,
  quietPoolSweepBatchSize: QUIET_POOL_SWEEP_BATCH_SIZE,
  quietPoolSweepIntervalMs: QUIET_POOL_SWEEP_INTERVAL_MS,
  quietPoolRetryBaseMs: QUIET_POOL_RETRY_BASE_MS,
  quietPoolRetryMaxMs: QUIET_POOL_RETRY_MAX_MS,
  v3NearWordRadius: V3_NEARBY_WORD_RADIUS,
  polygonHubTokens: POLYGON_HUB_TOKENS,
});
const discoveryRefreshCoordinator = createDiscoveryRefreshCoordinator({
  isRunning: () => runtime.isRunning(),
  log,
  getRepositories: () => repositories,
  stateCache,
  getWatcher: () => runtime.getWatcher(),
  isHydratablePool: (pool: PoolRecord) => isSupportedWarmupProtocol(pool.protocol),
  claimDeferredHydration: (pools: PoolRecord[]) => quietPoolSweepCoordinator.claimDeferredHydration(pools),
  releaseDeferredHydration: (pools: PoolRecord[]) => quietPoolSweepCoordinator.releaseDeferredHydration(pools),
  fetchAndCacheStates: _fetchAndCacheStates,
  validatePoolState,
  clearDeferredHydrationRetry: (address: string) => quietPoolSweepCoordinator.clearDeferredHydrationRetry(address),
  recordDeferredHydrationFailure: (address: string, reason: string) => quietPoolSweepCoordinator.recordDeferredHydrationFailure(address, reason),
  topology: {
    invalidate: (reason?: string) => topologyService?.invalidate(reason),
  },
  refreshCycles,
  v3NearWordRadius: V3_NEARBY_WORD_RADIUS,
});
const watcherBatchCoordinator = createWatcherBatchCoordinator({
  stateCache,
  log,
  validatePoolState,
  debugInvalidPool: (addr: string, reason?: string) => {
    rootLogger.debug(`[runner] Pool ${addr} is currently unroutable: ${reason ?? "invalid state"}`);
  },
  removePoolsFromTopology: (poolAddresses: Set<string>) => topologyService?.removePools(poolAddresses) ?? 0,
  removeRoutesByPools: (poolAddresses: Set<string>) => routeCache.removeByPools(poolAddresses),
  admitPools: (poolAddresses: Set<string>) => topologyService?.admitPools(poolAddresses) ?? 0,
  updatePriceOracle: (changedPools?: Iterable<string>) => runtime.getPriceOracle()?.update(changedPools),
  revalidateCachedRoutes: async (changedPools: Set<string>) => {
    await opportunityEngine?.revalidateCachedRoutes(changedPools);
  },
});
const reorgRecoveryCoordinator = createReorgRecoveryCoordinator({
  log,
  clearRouteCache: () => routeCache.clear(),
  clearTopologyCycles: () => topologyService?.setCachedCycles([]),
  resetTopology: () => topologyService?.resetGraphs(),
  refreshPriceOracle: () => runtime.getPriceOracle()?.update(),
});

const { scheduleArb, cancelScheduledArb, waitForIdle: waitForArbIdle } = createArbScheduler({
  isRunning: () => runtime.isRunning(),
  recordArbActivity,
  getAdaptiveDebounceMs,
  runPass: () => runPass(),
  onRunError: (err) => {
    log(`Scheduled arb pass failed: ${err instanceof Error ? err.message : String(err)}`, "error", {
      event: "scheduled_arb_error",
      err,
    });
  },
});
const watcherHaltCoordinator = createWatcherHaltCoordinator({
  log,
  setRunning: (running: boolean) => runtime.setRunning(running),
  setBotStatus: (status) => {
    botState.status = status;
  },
  cancelScheduledArb,
  stopHeartbeat,
  recordWatcherHalt,
});
const startupCoordinator = createStartupCoordinator({
  log,
  createRegistry: () => new RegistryService(DB_PATH),
  createRepositories: (nextRegistry: RegistryService) => createRegistryRepositories(nextRegistry),
  createPriceOracle: (nextRegistry: RegistryService) => new PriceOracle(stateCache, nextRegistry),
  createNonceManager: () => new NonceManager(),
  setPriceOracle: (oracle: PriceOracle) => runtime.setPriceOracle(oracle),
  setNonceManager: (nonceManager: NonceManager) => runtime.setNonceManager(nonceManager),
  runInitialDiscovery: () => discoveryCoordinator.runInitialDiscovery(),
  seedStateCache,
  warmupStateCache,
  refreshCycles,
  getCachedCycleCount: () => topologyService?.getCachedCycles().length ?? 0,
});

let heartbeat: ReturnType<typeof setInterval> | null = null;

function stopHeartbeat() {
  if (!heartbeat) return;
  clearInterval(heartbeat);
  heartbeat = null;
}

topologyService = createTopologyService({
  routingCycleMode: ROUTING_CYCLE_MODE,
  routingMaxHops: ROUTING_MAX_HOPS,
  maxTotalPaths: MAX_TOTAL_PATHS,
  polygonHubTokens: POLYGON_HUB_TOKENS,
  hub4Tokens: HUB_4_TOKENS,
  selective4HopTokenLimit: SELECTIVE_4HOP_TOKEN_LIMIT,
  workerCount: WORKER_COUNT,
  workerPool,
  isWorkerPoolInitialized: () => workerPool.initialized,
  cycleRefreshIntervalMs: CYCLE_REFRESH_INTERVAL_MS,
  routeCache,
  stateCache,
  registry: {
    getActivePoolsMeta: () => registry?.getActivePoolsMeta() ?? [],
    getPoolMeta: (address: string) => registry?.getPoolMeta(address),
  },
  buildGraph,
  buildHubGraph,
  serializeTopology,
  enumerateCycles,
  enumerateCyclesDual,
  validatePoolState,
  clearGasEstimateCache,
  log,
});

const topologyRefreshCoordinator = createTopologyRefreshCoordinator({
  getPriceOracle: () => runtime.getPriceOracle(),
  getTopologyService: () => topologyService,
  clearExecutionRouteQuarantine: (reason: string) => opportunityEngine?.clearExecutionRouteQuarantine(reason),
  maxPriceAgeMs: MAX_PRICE_AGE_MS,
  minLiquidityWmatic: 7_143n * 10n ** 18n,
  selective4HopPathBudget: SELECTIVE_4HOP_PATH_BUDGET,
  selective4HopMaxPathsPerToken: SELECTIVE_4HOP_MAX_PATHS_PER_TOKEN,
});
async function refreshCycles(force = false) {
  return topologyRefreshCoordinator.refreshCycles(force);
}

const maybeHydrateQuietPools = quietPoolSweepCoordinator.maybeHydrateQuietPools;

opportunityEngine = createOpportunityEngine({
  execution: {
    liveMode: LIVE_MODE,
    privateKey: PRIVATE_KEY,
    executorAddress: EXECUTOR_ADDRESS,
    rpcUrl: POLYGON_RPC,
    getNonceManager: () => runtime.getNonceManager(),
    maxExecutionBatch: MAX_EXECUTION_BATCH,
    executionRouteQuarantineMs: EXECUTION_ROUTE_QUARANTINE_MS,
    minProfitWei: MIN_PROFIT_WEI,
    log,
    fmtPath,
    getRouteFreshness,
    getCurrentFeeSnapshot,
    getFreshTokenToMaticRate: pricingService.getFreshTokenToMaticRate,
    deriveOnChainMinProfit,
    buildArbTx,
    sendTx,
    sendTxBundle,
    hasPendingExecution: hasTrackedPendingTx,
    scalePriorityFeeByProfitMargin,
    onPreparedCandidateError: (candidate: CandidateEntry, reason: string, quarantine: ExecutionQuarantine) => {
      log(`[runner] Quarantining route after execution preparation failure: ${reason}`, "warn", {
        event: "execute_quarantine_add",
        route: fmtPath(candidate.path),
        hopCount: candidate.path.hopCount,
        failures: quarantine.failures,
        quarantineMs: Math.max(0, quarantine.until - Date.now()),
        reason,
      });
    },
  },
  search: {
    cachedCycles: () => topologyService?.getCachedCycles() ?? [],
    topologyDirty: () => topologyService?.isTopologyDirty() ?? true,
    refreshCycles,
    passCount: () => runtime.getPassCount(),
    maxPathsToOptimize: MAX_PATHS_TO_OPTIMIZE,
    minProfitWei: MIN_PROFIT_WEI,
    stateCache,
    log,
    getCurrentFeeSnapshot,
    getFreshTokenToMaticRate: pricingService.getFreshTokenToMaticRate,
    getRouteFreshness,
    getProbeAmountsForToken: pricingService.getProbeAmountsForToken,
    evaluatePathsParallel,
    optimizeInputAmount: (path: ArbPathLike, cache: Map<string, Record<string, any>>, options: any) =>
      optimizeInputAmount(path, cache, options) as unknown as RouteResultLike | null,
    evaluateCandidatePipeline,
    partitionFreshCandidates,
    routeCacheUpdate: (candidates: CandidateEntry[]) => routeCache.update(candidates),
    routeKeyFromEdges,
    fmtPath,
    fmtProfit: pricingService.fmtProfit,
    onPathsEvaluated: (count: number) => pathsEvaluated.inc({ pass: runtime.getPassCount() }, count),
    onCandidateMetrics: ({ topCandidates, optimizedCandidates, profitableRoutes }: { topCandidates: number; optimizedCandidates: number; profitableRoutes: number }) => {
      candidateShortlistSize.observe(topCandidates);
      candidateOptimizedCount.observe(optimizedCandidates);
      candidateProfitableCount.observe(profitableRoutes);
      candidateProfitableYield.observe(topCandidates > 0 ? profitableRoutes / topCandidates : 0);
    },
    onArbsFound: (count: number) => arbsFound.inc({ pass: runtime.getPassCount() }, count),
    workerCount: WORKER_COUNT,
  },
  revalidation: {
    getAffectedRoutes: (changedPools: Set<string>) =>
      (routeCache.getByPools(changedPools) as Array<{ path: any; result: any }>).map(({ path, result }) => ({
        path: path as ArbPathLike,
        result: opportunityEngine!.toRouteResultLike(result),
      })),
    stateCache,
    testAmountWei: TEST_AMOUNT_WEI,
    minProfitWei: MIN_PROFIT_WEI,
    maxExecutionBatch: MAX_EXECUTION_BATCH,
    log,
    getCurrentFeeSnapshot,
    getFreshTokenToMaticRate: pricingService.getFreshTokenToMaticRate,
    getRouteFreshness,
    simulateRoute: (path: ArbPathLike, amountIn: bigint, cache: Map<string, Record<string, any>>) =>
      simulateRoute(path, amountIn, cache) as unknown as RouteResultLike,
    optimizeInputAmount: (path: ArbPathLike, cache: Map<string, Record<string, any>>, options: any) =>
      optimizeInputAmount(path, cache, options) as unknown as RouteResultLike | null,
  },
});
passRunner = createPassRunner({
  getStateCacheSize: () => stateCache.size,
  getCachedCycleCount: () => topologyService?.getCachedCycles().length ?? 0,
  incrementPassCount: () => runtime.incrementPassCount(),
  getConsecutiveErrors: () => runtime.getConsecutiveErrors(),
  incrementConsecutiveErrors: () => runtime.incrementConsecutiveErrors(),
  resetConsecutiveErrors: () => runtime.resetConsecutiveErrors(),
  setBotState: ({ passCount, consecutiveErrors, opportunities }) => {
    botState.passCount = passCount;
    botState.consecutiveErrors = consecutiveErrors;
    botState.opportunities = opportunities;
    botState.lastArbMs = Date.now();
  },
  log,
  trackBackgroundTask: (task) => {
    trackBackgroundTask(task as Promise<void>);
  },
  maybeRunDiscovery,
  reconcileDiscoveryResult: (result) => discoveryRefreshCoordinator.reconcileDiscoveryResult(result as { totalDiscovered?: number } | null | undefined),
  refreshCycles,
  maybeHydrateQuietPools,
  refreshPriceOracleIfStale: () => topologyRefreshCoordinator.refreshPriceOracleIfStale(),
  searchOpportunities: () => opportunityEngine!.search() as Promise<CandidateEntry[]>,
  executeBatchIfIdle: (candidates, reason) => opportunityEngine!.executeBatchIfIdle(candidates as any, reason),
  formatProfit: (profit, startToken) => pricingService.fmtProfit(profit, startToken),
  roiForCandidate: (candidate) => roiForCandidate(candidate as CandidateEntry),
  formatDuration,
  sleep: runnerSleep,
  maxConsecutiveErrors: MAX_CONSECUTIVE_ERRORS,
  maxExecutionBatch: MAX_EXECUTION_BATCH,
});

// ─── Arb pass ──────────────────────────────────────────────────

async function runPass() {
  return passRunner!.runPass();
}

// ─── Debounced arb trigger ────────────────────────────────────

// ─── Shutdown ──────────────────────────────────────────────────
const shutdown = createShutdownHandler({
  log,
  setRunning: (next) => { runtime.setRunning(next); },
  stopTui: () => {
    stopTui?.();
    stopTui = null;
  },
  getWatcher: () => runtime.getWatcher(),
  gasOracle,
  getRegistry: () => registry,
  workerPool,
  stopMetricsServer,
  stopHeartbeat,
  cancelScheduledArb,
  waitForArbIdle,
  waitForBackgroundTasks,
  exit: (code) => process.exit(code),
});
const bootModeCoordinator = createBootModeCoordinator({
  botState,
  setBotStatus: (status) => {
    botState.status = status;
  },
  setStopTui: (next) => {
    stopTui = next;
  },
  startTui: async (nextBotState) => {
    const { startTui } = await import("./src/tui/index.tsx");
    return startTui(nextBotState);
  },
  startMetricsServer: () => {
    startMetricsServer(9090);
  },
  printBanner: () => {
    console.log("╔══════════════════════════════════════════════╗");
    console.log("║   Polygon Arbitrage Bot — Event-Driven       ║");
    console.log(`║   Workers: ${String(WORKER_COUNT).padEnd(3)}  Paths: ${String(MAX_TOTAL_PATHS).padEnd(7)}          ║`);
    console.log("╚══════════════════════════════════════════════╝");
  },
  loopMode: LOOP_MODE,
  discoveryOnly: DISCOVERY_ONLY,
  envioApiToken: ENVIO_API_TOKEN,
  runPass,
  shutdown,
  createWatcher: () => new StateWatcher(registry, stateCache),
  setWatcher: (watcher) => {
    runtime.setWatcher(watcher);
  },
  configureWatcher: (watcher) => {
    configureWatcherCallbacks({
      watcher,
      log,
      onPoolsChanged: async ({ changedPools }) => {
        await watcherBatchCoordinator.handlePoolsChanged(changedPools);
      },
      onReorgDetected: ({ reorgBlock, changedPools }) => {
        reorgRecoveryCoordinator.handleReorgDetected(reorgBlock, changedPools);
      },
      onHaltDetected: ({ payload }) => {
        watcherHaltCoordinator.handleHaltDetected(payload);
      },
      scheduleArb,
    });
  },
  log,
  fastArbDebounceMs: FAST_ARB_DEBOUNCE_MS,
  baseArbDebounceMs: BASE_ARB_DEBOUNCE_MS,
  heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
  formatDuration,
  setWatcherHealthy,
  startHeartbeat: () => {
    heartbeat = setInterval(scheduleArb, HEARTBEAT_INTERVAL_MS);
  },
  scheduleArb: () => {
    scheduleArb();
  },
  stopHeartbeat,
});

// ─── Main ──────────────────────────────────────────────────────

async function main() {
  await bootModeCoordinator.startOperatorSurface(TUI_MODE);

  const initializedRuntime = startupCoordinator.initializeRuntime();
  registry = initializedRuntime.registry;
  repositories = initializedRuntime.repositories;

  process.on("SIGINT",  shutdown);
  process.on("SIGTERM", shutdown);

  // Init worker pool early so workers are warm before first arb scan
  if (WORKER_COUNT >= 2) {
    workerPool.init();
    log(`Worker pool: ${WORKER_COUNT} threads (threshold: ${EVAL_WORKER_THRESHOLD} paths)`);
  }

  await startupCoordinator.bootstrapRouting();
  await bootModeCoordinator.runAfterBootstrap();
}

main().catch((err: any) => {
  rootLogger.fatal({ event: "main_fatal", err }, "Fatal error");
  void shutdown(1, "fatal");
});
