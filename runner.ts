
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
  startMetricsServer,
  stopMetricsServer,
} from "./src/utils/metrics.ts";
import type { BotState } from "./src/tui/types.ts";
import { getPoolMetadata, getPoolTokens } from "./src/util/pool_record.ts";
import { takeTopNBy } from "./src/util/bounded_priority.ts";
import {
  minProfitInTokenUnits,
  type ArbPathLike,
  type AssessmentLike,
  type CandidateEntry,
  type RouteResultLike,
} from "./src/arb/assessment.ts";
import { createOpportunityEngine } from "./src/arb/opportunity_engine.ts";
import { createWarmupManager } from "./src/bootstrap/warmup.ts";
import { createDiscoveryCoordinator } from "./src/bootstrap/discovery.ts";
import { configureWatcherCallbacks, createArbScheduler, createShutdownHandler } from "./src/bootstrap/lifecycle.ts";
import { createRuntimeContext } from "./src/runtime/runtime_context.ts";
import { createTopologyService } from "./src/runtime/topology_service.ts";
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
const MAX_EXECUTION_BATCH = 3;
const EXECUTION_ROUTE_QUARANTINE_MS = 120_000;

// Minimum ms between arb scans — coalesces rapid HyperSync batches.
const ARB_DEBOUNCE_MS = BASE_ARB_DEBOUNCE_MS;
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
let lastQuietPoolSweepAt = 0;

// ─── TUI Setup ─────────────────────────────────────────────────

const runnerLogger: PinoLogger = logger.child({ component: "runner" });
const rootLogger: PinoLogger = logger;
let repositories: ReturnType<typeof createRegistryRepositories> | null = null;
let topologyService: ReturnType<typeof createTopologyService> | null = null;
let opportunityEngine: ReturnType<typeof createOpportunityEngine> | null = null;

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

function uniqueSortedBigInts(values: Array<string | number | bigint>) {
  return [...new Set(values.map(String))]
    .map((value) => BigInt(value))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function getProbeAmountsForToken(tokenAddress: string) {
  let decimals = repositories?.tokens.getMeta(tokenAddress)?.decimals;
  if (decimals == null) decimals = 18;

  const rawUnit = 10n ** BigInt(Math.max(0, Math.min(Number(decimals), 18)));
  const oracle = runtime.getPriceOracle();
  const oracleScaledProbes = oracle
    ? [
        oracle.fromMatic(tokenAddress, 5n * 10n ** 16n), // 0.05 MATIC
        oracle.fromMatic(tokenAddress, 5n * 10n ** 17n), // 0.5 MATIC
        oracle.fromMatic(tokenAddress, 2n * 10n ** 18n), // 2 MATIC
        oracle.fromMatic(tokenAddress, 10n ** 19n),      // 10 MATIC
      ]
    : [];
  const probes = uniqueSortedBigInts([
    MIN_PROBE_AMOUNT,
    rawUnit / 10n,
    rawUnit,
    rawUnit * 10n,
    rawUnit * 100n,
    rawUnit * 1_000n,
    TEST_AMOUNT_WEI,
    ...oracleScaledProbes,
  ]);

  return probes.filter((amount) => amount >= MIN_PROBE_AMOUNT);
}
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
  return runtime.getPriceOracle()?.getFreshRate?.(tokenAddress, MAX_PRICE_AGE_MS) ?? 0n;
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

function compareDeferredHydrationPriority(a: PoolRecord, b: PoolRecord) {
  const aTokens = getPoolTokens(a);
  const bTokens = getPoolTokens(b);
  const aHubMatches = aTokens.filter((token) => POLYGON_HUB_TOKENS.has(token)).length;
  const bHubMatches = bTokens.filter((token) => POLYGON_HUB_TOKENS.has(token)).length;
  if (aHubMatches !== bHubMatches) return bHubMatches - aHubMatches;

  const aIsV3 = /V3|ELASTIC/.test(a.protocol);
  const bIsV3 = /V3|ELASTIC/.test(b.protocol);
  if (aIsV3 !== bIsV3) return aIsV3 ? 1 : -1;

  return a.pool_address.localeCompare(b.pool_address);
}

function selectPendingQuietPools(activePools: PoolRecord[]) {
  const pending: PoolRecord[] = [];
  for (const pool of activePools) {
    const addr = pool.pool_address.toLowerCase();
    if (validatePoolState(stateCache.get(addr)).valid) continue;
    pending.push(pool);
  }
  return takeTopNBy(pending, QUIET_POOL_SWEEP_BATCH_SIZE, compareDeferredHydrationPriority);
}

function seedNewPoolsIntoStateCache(pools: PoolRecord[]) {
  const newPools: PoolRecord[] = [];
  for (const pool of pools) {
    const poolAddress = pool.pool_address.toLowerCase();
    if (stateCache.has(poolAddress)) continue;

    let poolTokens;
    try {
      poolTokens = typeof pool.tokens === "string" ? JSON.parse(pool.tokens) : pool.tokens;
    } catch {
      poolTokens = [];
    }

    stateCache.set(poolAddress, {
      poolId: poolAddress,
      protocol: pool.protocol,
      tokens: Array.isArray(poolTokens) ? poolTokens.map((token) => token.toLowerCase()) : [],
      timestamp: 0,
    });
    newPools.push(pool);
  }
  return newPools;
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

function fmtSym(addr: string) {
  return repositories?.tokens.getMeta(addr)?.symbol ?? addr.slice(2, 8).toUpperCase();
}

function formatTokenAmount(amount: bigint, decimals: number, fractionDigits = 6) {
  const safeDecimals = Math.max(0, Math.min(Number(decimals) || 0, 18));
  const scale = 10n ** BigInt(safeDecimals);
  const negative = amount < 0n;
  const absAmount = negative ? -amount : amount;
  const whole = absAmount / scale;
  const fraction = absAmount % scale;

  if (fractionDigits <= 0 || safeDecimals === 0) {
    return `${negative ? "-" : ""}${whole.toString()}`;
  }

  const paddedFraction = fraction.toString().padStart(safeDecimals, "0");
  const clippedFraction = paddedFraction
    .slice(0, Math.min(fractionDigits, safeDecimals))
    .replace(/0+$/, "");

  return clippedFraction.length > 0
    ? `${negative ? "-" : ""}${whole.toString()}.${clippedFraction}`
    : `${negative ? "-" : ""}${whole.toString()}`;
}

function fmtPath(path: ArbPathLike) {
  const tokens = [path.startToken, ...path.edges.map(e => e.tokenOut)];
  const prots  = path.edges.map(e => e.protocol);
  return `${tokens.map(fmtSym).join('→')}  [${prots.join('/')}]`;
}

function fmtProfit(netWei: bigint, tokenAddr: string) {
  const meta = repositories?.tokens.getMeta(tokenAddr);
  const dec  = meta?.decimals ?? 18;
  const sym  = meta?.symbol   ?? tokenAddr.slice(2, 8).toUpperCase();
  return `${formatTokenAmount(netWei, dec, 6)} ${sym}`;
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
const backgroundTasks = new Set<Promise<void>>();

function trackBackgroundTask(task: Promise<void>) {
  backgroundTasks.add(task);
  void task.finally(() => {
    backgroundTasks.delete(task);
  });
  return task;
}

async function waitForBackgroundTasks() {
  while (backgroundTasks.size > 0) {
    await Promise.allSettled([...backgroundTasks]);
  }
}

const { scheduleArb, cancelScheduledArb, waitForIdle: waitForArbIdle } = createArbScheduler({
  isRunning: () => runtime.isRunning(),
  recordArbActivity,
  getAdaptiveDebounceMs,
  runPass: () => runPass(),
});

let heartbeat: ReturnType<typeof setInterval> | null = null;

function stopHeartbeat() {
  if (!heartbeat) return;
  clearInterval(heartbeat);
  heartbeat = null;
}

topologyService = createTopologyService({
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

async function refreshCycles(force = false) {
  const oracle = runtime.getPriceOracle();
  if (oracle && !oracle.isFresh(MAX_PRICE_AGE_MS)) {
    oracle.update();
  }
  const getRateWei = oracle
    ? ((currentOracle: PriceOracle) => (addr: string) => currentOracle.getFreshRate(addr, MAX_PRICE_AGE_MS))(oracle)
    : null;

  return topologyService?.refreshCycles({
    force,
    minLiquidityWmatic: 7_143n * 10n ** 18n,
    selective4HopPathBudget: SELECTIVE_4HOP_PATH_BUDGET,
    selective4HopMaxPathsPerToken: SELECTIVE_4HOP_MAX_PATHS_PER_TOKEN,
    getRateWei,
    clearExecutionRouteQuarantine: (reason) => opportunityEngine?.clearExecutionRouteQuarantine(reason),
  });
}

async function maybeHydrateQuietPools() {
  const now = Date.now();
  if (now - lastQuietPoolSweepAt < QUIET_POOL_SWEEP_INTERVAL_MS) return;
  lastQuietPoolSweepAt = now;

  const activePools = registry?.getActivePoolsMeta() ?? [];
  const pending = selectPendingQuietPools(activePools);

  if (pending.length === 0) return;

  log(`[runner] Quiet-pool sweep: hydrating ${pending.length} deferred pool(s).`, "info", {
    event: "quiet_pool_sweep_start",
    pendingPools: pending.length,
    batchSize: QUIET_POOL_SWEEP_BATCH_SIZE,
  });

  const warmupStats = await _fetchAndCacheStates(pending, {
    v3HydrationMode: "nearby",
    v3NearWordRadius: V3_NEARBY_WORD_RADIUS,
  });
  const hydratedAddrs = new Set<string>();
  for (const pool of pending) {
    const addr = pool.pool_address.toLowerCase();
    if (validatePoolState(stateCache.get(addr)).valid) {
      hydratedAddrs.add(addr);
    }
  }
  const admitted = topologyService?.admitPools(hydratedAddrs) ?? 0;

  log(`[runner] Quiet-pool sweep complete: ${hydratedAddrs.size}/${pending.length} routable.`, "info", {
    event: "quiet_pool_sweep_complete",
    pendingPools: pending.length,
    routablePools: hydratedAddrs.size,
    admittedPools: admitted,
    warmupStats,
  });

  if (admitted > 0) {
    await refreshCycles(true);
  }
}

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
    getFreshTokenToMaticRate,
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
    getFreshTokenToMaticRate,
    getRouteFreshness,
    getProbeAmountsForToken,
    evaluatePathsParallel,
    optimizeInputAmount: (path: ArbPathLike, cache: Map<string, Record<string, any>>, options: any) =>
      optimizeInputAmount(path, cache, options) as unknown as RouteResultLike | null,
    evaluateCandidatePipeline,
    partitionFreshCandidates,
    routeCacheUpdate: (candidates: CandidateEntry[]) => routeCache.update(candidates),
    routeKeyFromEdges,
    fmtPath,
    fmtProfit,
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
    getFreshTokenToMaticRate,
    getRouteFreshness,
    simulateRoute: (path: ArbPathLike, amountIn: bigint, cache: Map<string, Record<string, any>>) =>
      simulateRoute(path, amountIn, cache) as unknown as RouteResultLike,
    optimizeInputAmount: (path: ArbPathLike, cache: Map<string, Record<string, any>>, options: any) =>
      optimizeInputAmount(path, cache, options) as unknown as RouteResultLike | null,
  },
});

// ─── Arb pass ──────────────────────────────────────────────────

async function runPass() {
  const t0 = Date.now();
  const passCount = runtime.incrementPassCount();
  const cachedCycles = topologyService?.getCachedCycles() ?? [];
  log(`Pass #${passCount} — state: ${stateCache.size} pools, paths: ${cachedCycles.length}`, "info", {
    event: "pass_start",
    pass: passCount,
    stateSize: stateCache.size,
    cachedPaths: cachedCycles.length,
  });

  try {
    // Background discovery (non-blocking, self-throttled)
    trackBackgroundTask((async () => {
      const result = await maybeRunDiscovery();
      if (!runtime.isRunning() || !result?.totalDiscovered) return;

      repositories?.pools.invalidateMetaCache();
      // Seed stateCache for new pools and extend the HyperSync stream filter
      const allPools = repositories?.pools.getActiveMeta() ?? [];
      const newPools = seedNewPoolsIntoStateCache(allPools);
      if (newPools.length > 0) {
        await runtime.getWatcher()?.addPools(
          newPools.map((p: PoolRecord) => p.pool_address.toLowerCase())
        );
        if (!runtime.isRunning()) return;
        // Fetch live state for newly discovered pools before rebuilding topology
        await _fetchAndCacheStates(newPools, {
          v3HydrationMode: "nearby",
          v3NearWordRadius: V3_NEARBY_WORD_RADIUS,
        });
        if (!runtime.isRunning()) return;
      }
      // Rebuild cycle topology with the new pool set
      topologyService?.invalidate("background_discovery");
      await refreshCycles(true);
    })().catch((err: any) => {
      log(`Background discovery error: ${err?.message ?? err}`, "warn", {
        event: "discovery_bg_error",
        err,
      });
    }));

    // Refresh cycles if not yet built
    await refreshCycles();
    trackBackgroundTask(maybeHydrateQuietPools().catch((err: any) => {
      log(`Quiet-pool sweep error: ${err?.message ?? err}`, "warn", {
        event: "quiet_pool_sweep_error",
        err,
      });
    }));

    // Update price oracle from live state only when stale; watcher batches do incremental refreshes.
    const priceOracle = runtime.getPriceOracle();
    if (priceOracle && !priceOracle.isFresh(MAX_PRICE_AGE_MS)) {
      priceOracle.update();
    }

    const opportunities = await opportunityEngine!.search();
    botState.passCount         = passCount;
    botState.consecutiveErrors = runtime.getConsecutiveErrors();
    botState.opportunities     = opportunities.slice(0, 5).map((o: CandidateEntry) => ({
      Route:  o.path.edges.map(e => e.protocol).join(' -> '),
      Profit: fmtProfit(o.result.profit, o.path.startToken),
      ROI:    `${(roiForCandidate(o) / 10000).toFixed(2)}%`,
    }));
    log(`Pass #${passCount}: ${opportunities.length} profitable route(s)`, "info", {
      event: "pass_opportunities",
      pass: passCount,
      opportunities: opportunities.length,
      stateSize: stateCache.size,
      cachedPaths: (topologyService?.getCachedCycles() ?? []).length,
      lastPass: formatDuration(Date.now() - t0),
    });

    if (opportunities.length > 0) {
      log("Executing top opportunity set...", "info", {
        event: "pass_execute_best",
        pass: passCount,
        opportunities: Math.min(opportunities.length, MAX_EXECUTION_BATCH),
      });
      await opportunityEngine!.executeBatchIfIdle(opportunities.slice(0, MAX_EXECUTION_BATCH), "run_pass");
    }

    log(`Pass #${passCount} complete in ${formatDuration(Date.now() - t0)}`, "info", {
      event: "pass_complete",
      pass: passCount,
      durationMs: Date.now() - t0,
      opportunities: opportunities.length,
    });
    runtime.resetConsecutiveErrors();
  } catch (err: any) {
    log(`Pass #${passCount} failed: ${err.message}`, "error", {
      event: "pass_failed",
      pass: passCount,
      consecutiveErrors: runtime.getConsecutiveErrors() + 1,
      err,
    });
    const consecutiveErrors = runtime.incrementConsecutiveErrors();
    if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
      log(`${MAX_CONSECUTIVE_ERRORS} consecutive errors — backing off 30s`, "warn");
      await runnerSleep(30_000);
      runtime.resetConsecutiveErrors();
    }
  }
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
  repositories = createRegistryRepositories(registry);
  runtime.setPriceOracle(new PriceOracle(stateCache, registry));
  runtime.setNonceManager(new NonceManager());

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
  if ((topologyService?.getCachedCycles() ?? []).length === 0) {
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

  const watcher = new StateWatcher(registry, stateCache);
  runtime.setWatcher(watcher);

  configureWatcherCallbacks({
    watcher,
    log,
    onPoolsChanged: async ({ changedPools }) => {
      const { valid: validChangedAddrs, invalid: invalidChangedAddrs } = partitionChangedPools(changedPools);
      if (validChangedAddrs.size === 0 && invalidChangedAddrs.size === 0) {
        log("[runner] No usable pool changes in watcher batch", "debug", {
          event: "watcher_batch_skip",
          changedPools: changedPools.size,
        });
        return;
      }

      if (invalidChangedAddrs.size > 0) {
        const removedEdges = topologyService?.removePools(invalidChangedAddrs) ?? 0;
        const removedRoutes = routeCache.removeByPools(invalidChangedAddrs);
        log(
          `[runner] ${invalidChangedAddrs.size} pool(s) became unroutable; ${removedEdges / 2} removed from topology.`,
          "info",
          {
            event: "watcher_batch_remove_unroutable",
            changedPools: changedPools.size,
            invalidPools: invalidChangedAddrs.size,
            removedPools: removedEdges / 2,
            removedRoutes,
          },
        );
      }

      if (validChangedAddrs.size > 0) {
        log(`[watcher] ${validChangedAddrs.size}/${changedPools.size} pool state(s) updated`, "info", {
          event: "watcher_batch_valid",
          changedPools: changedPools.size,
          validPools: validChangedAddrs.size,
        });
        const admitted = topologyService?.admitPools(validChangedAddrs) ?? 0;
        if (admitted > 0) {
          log(`[runner] Admitted ${admitted} newly routable pool(s); refreshing cycles soon.`, "info", {
            event: "watcher_batch_admit",
            changedPools: changedPools.size,
            validPools: validChangedAddrs.size,
            admittedPools: admitted,
          });
        }
        runtime.getPriceOracle()?.update(validChangedAddrs);
        await opportunityEngine?.revalidateCachedRoutes(validChangedAddrs);
      }
    },
    onReorgDetected: ({ reorgBlock, changedPools }) => {
      log(`[runner] Reorg rollback to block ${reorgBlock}; clearing cached routes and topology`, "warn", {
        event: "watcher_reorg",
        reorgBlock,
        changedPools: changedPools.size,
      });
      routeCache.clear();
      topologyService?.setCachedCycles([]);
      topologyService?.resetGraphs();
      runtime.getPriceOracle()?.update();
      if (changedPools.size > 0) {
        log(`[runner] Reorg cache reload touched ${changedPools.size} active pool(s)`, "debug", {
          event: "watcher_reorg_reload",
          changedPools: changedPools.size,
        });
      }
    },
    scheduleArb,
  });

  log(`Starting HyperSync stream (debounce: ${FAST_ARB_DEBOUNCE_MS}-${BASE_ARB_DEBOUNCE_MS}ms adaptive, heartbeat: ${formatDuration(HEARTBEAT_INTERVAL_MS)})...`, "info", {
    event: "watcher_start",
    debounceMs: BASE_ARB_DEBOUNCE_MS,
    fastDebounceMs: FAST_ARB_DEBOUNCE_MS,
    heartbeatMs: HEARTBEAT_INTERVAL_MS,
  });
      await watcher.start(undefined);

  // Heartbeat: guarantee a scan even if the market is quiet
  heartbeat = setInterval(scheduleArb, HEARTBEAT_INTERVAL_MS);

  // Run one pass immediately so we don't wait for the first event
  scheduleArb();

  // Block until watcher stops (stop() resolves _loopPromise)
  await watcher.wait();
  stopHeartbeat();
}

main().catch((err: any) => {
  rootLogger.fatal({ event: "main_fatal", err }, "Fatal error");
  process.exit(1);
});
