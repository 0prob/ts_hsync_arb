// @ts-nocheck
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
import { enumerateCyclesDual } from "./src/routing/enumerate_cycles.ts";
import { RouteCache } from "./src/routing/route_cache.ts";
import { routeKeyFromEdges } from "./src/routing/finder.ts";
import { evaluatePathsParallel, optimizeInputAmount, simulateRoute } from "./src/routing/simulator.ts";
import { workerPool } from "./src/routing/worker_pool.ts";
import { computeProfit } from "./src/profit/compute.ts";
import { buildArbTx } from "./src/execution/build_tx.ts";
import { sendTx } from "./src/execution/send_tx.ts";
import { NonceManager } from "./src/execution/nonce_manager.ts";
import { fetchEIP1559Fees, oracle as gasOracle } from "./src/execution/gas.ts";
import { PriceOracle } from "./src/profit/price_oracle.ts";
import { StateWatcher } from "./src/state/watcher.ts";
import { validatePoolState, normalizePoolState } from "./src/state/normalizer.ts";
import { fetchMultipleV2States } from "./src/state/uniswap_v2.ts";
import { fetchMultipleV3States } from "./src/state/uniswap_v3.ts";
import { fetchAndNormalizeBalancerPool } from "./src/state/poll_balancer.ts";
import { fetchAndNormalizeCurvePool } from "./src/state/poll_curve.ts";
import { throttledMap } from "./src/enrichment/rpc.ts";
import { logger } from "./src/utils/logger.ts";
import { pathsEvaluated, arbsFound, startMetricsServer, stopMetricsServer } from "./src/utils/metrics.ts";
import { startTui } from "./src/tui/index.tsx";
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
  ROUTE_STATE_MAX_AGE_MS,
  ROUTE_STATE_MAX_SKEW_MS,
} from "./src/config/index.ts";

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

// Minimum ms between arb scans — coalesces rapid HyperSync batches.
const ARB_DEBOUNCE_MS = 200;
// Fallback scan interval if no HyperSync events arrive (e.g. quiet market).
const HEARTBEAT_INTERVAL_MS = Math.max(POLL_INTERVAL_SEC * 1000, 30_000);

// ─── Globals ───────────────────────────────────────────────────

const stateCache  = new Map();
const routeCache  = new RouteCache(1_000); // top-1000 profitable routes
let registry      = null;
let watcher       = null;
let priceOracle   = null;
let nonceManager  = null;
let running       = true;
let cachedCycles  = [];
// Two routing graphs: hubGraph (HUB_4_TOKENS only) + fullGraph (all pools).
// Both are rebuilt when new pools are discovered (topology change).
let hubGraph      = null;
let fullGraph     = null;
let topologyVersion = 0;
let topologyDirty = true;
let cachedHubTopology = null;
let cachedFullTopology = null;
let cachedHubTopologyGraph = null;
let cachedFullTopologyGraph = null;

let passCount          = 0;
let consecutiveErrors  = 0;

// Shared live state — the TUI polls this; the hot path never calls into tui/
const botState = {
  status: /** @type {'idle'|'running'|'error'} */ ('idle'),
  passCount: 0,
  consecutiveErrors: 0,
  gasPrice: '0',
  maticPrice: 'N/A',
  lastArbMs: 0,
  opportunities: /** @type {any[]} */ ([]),
  logs: /** @type {string[]} */ ([]),
};

// Discovery
let lastDiscoveryMs    = 0;
let discoveryInFlight  = false;

// Cycle refresh reentrancy guard
let cycleRefreshRunning = false;

// Arb debounce
let _arbQueued = false;
let _lastArbMs = 0;
let _arbRunning = false;
let _arbDirty = false;

// ─── TUI Setup ─────────────────────────────────────────────────

const runnerLogger = logger.child({ component: "runner" });

function log(msg, level = "info", meta = undefined) {
  botState.logs.unshift(`[${level.toUpperCase()}] ${msg}`);
  if (botState.logs.length > 10) botState.logs.length = 10;

  if (!runnerLogger.isLevelEnabled(level)) return;

  const payload = typeof meta === "function" ? meta() : meta;
  if (payload && Object.keys(payload).length > 0) {
    runnerLogger[level](payload, msg);
    return;
  }
  runnerLogger[level](msg);
}

// ─── Helpers ───────────────────────────────────────────────────

const runnerSleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MIN_PROBE_AMOUNT = 1_000n;

function poolTokenList(pool) {
  try {
    const tokens = typeof pool.tokens === "string" ? JSON.parse(pool.tokens) : pool.tokens;
    return Array.isArray(tokens) ? tokens.map((token) => token.toLowerCase()) : [];
  } catch {
    return [];
  }
}

function uniqueSortedBigInts(values) {
  return [...new Set(values.map(String))]
    .map((value) => BigInt(value))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function getProbeAmountsForToken(tokenAddress) {
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

function mergeCandidateBatch(into, batch) {
  for (const entry of batch) {
    const key = routeKeyFromEdges(entry.path.startToken, entry.path.edges);
    const current = into.get(key);
    if (!current || entry.result.profit > current.result.profit) {
      into.set(key, entry);
    }
  }
}

function invalidateSerializedTopologies() {
  cachedHubTopology = null;
  cachedFullTopology = null;
  cachedHubTopologyGraph = null;
  cachedFullTopologyGraph = null;
}

function getSerializedTopologyCached(kind, graph) {
  if (kind === "hub") {
    if (cachedHubTopologyGraph !== graph || !cachedHubTopology) {
      cachedHubTopology = serializeTopology(graph);
      cachedHubTopologyGraph = graph;
    }
    return cachedHubTopology;
  }

  if (cachedFullTopologyGraph !== graph || !cachedFullTopology) {
    cachedFullTopology = serializeTopology(graph);
    cachedFullTopologyGraph = graph;
  }
  return cachedFullTopology;
}

function roiForCandidate(result) {
  if (!result?.amountIn || result.amountIn <= 0n) return -Infinity;
  return Number((result.profit * 1_000_000n) / result.amountIn);
}

function selectOptimizationCandidates(candidates, limit) {
  if (candidates.length <= limit) return candidates;

  const selected = new Map();
  const addBatch = (batch) => {
    for (const entry of batch) {
      const key = routeKeyFromEdges(entry.path.startToken, entry.path.edges);
      if (!selected.has(key)) {
        selected.set(key, entry);
        if (selected.size >= limit) break;
      }
    }
  };

  const topByProfit = [...candidates];
  const topByRoi = [...candidates].sort((a, b) => roiForCandidate(b.result) - roiForCandidate(a.result));
  const topByLogWeight = [...candidates].sort((a, b) => (a.path.logWeight || 0) - (b.path.logWeight || 0));

  addBatch(topByProfit.slice(0, Math.ceil(limit * 0.5)));
  addBatch(topByRoi.slice(0, Math.ceil(limit * 0.3)));
  addBatch(topByLogWeight.slice(0, Math.ceil(limit * 0.2)));
  addBatch(topByProfit);

  return [...selected.values()].slice(0, limit);
}

function getOptimizationOptions(quickResult) {
  const amountIn = quickResult?.amountIn ?? TEST_AMOUNT_WEI;
  const minAmount = amountIn > 10n ? amountIn / 10n : MIN_PROBE_AMOUNT;
  const maxAmount = amountIn * 8n > minAmount ? amountIn * 8n : minAmount * 8n;
  return {
    minAmount: minAmount > MIN_PROBE_AMOUNT ? minAmount : MIN_PROBE_AMOUNT,
    maxAmount,
    iterations: 24,
  };
}

function getAssessmentOptimizationOptions(path, quickResult, gasPriceWei, tokenToMaticRate) {
  return {
    ...getOptimizationOptions(quickResult),
    scorer: (routeResult) =>
      assessRouteResult(path, routeResult, gasPriceWei, tokenToMaticRate).netProfitAfterGas,
    accept: (routeResult) =>
      assessRouteResult(path, routeResult, gasPriceWei, tokenToMaticRate).shouldExecute,
  };
}

function shouldOptimizeCandidate(entry, index, total, bestQuickProfit) {
  const quickProfit = entry?.result?.profit ?? 0n;
  if (quickProfit <= 0n) return false;

  if (index < 3) return true;
  if (index < Math.ceil(total * 0.4)) return true;
  if (bestQuickProfit <= 0n) return index < Math.ceil(total * 0.5);

  // Preserve optimization for candidates whose quick pass is close to the best.
  return quickProfit * 100n >= bestQuickProfit * 25n;
}

function assessRouteResult(path, routeResult, gasPriceWei, tokenToMaticRate) {
  return computeProfit(routeResult, {
    gasPriceWei,
    tokenToMaticRate,
    slippageBps:   50n,
    revertRiskBps: 500n,
    minNetProfit:  MIN_PROFIT_WEI,
    hopCount:      path.hopCount,
  });
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

function getFreshTokenToMaticRate(tokenAddress) {
  return priceOracle?.getFreshRate?.(tokenAddress, MAX_PRICE_AGE_MS) ?? 0n;
}

function getPathFreshness(path) {
  let oldest = Infinity;
  let newest = -Infinity;

  for (const edge of path.edges) {
    const state = stateCache.get(edge.poolAddress);
    const ts = Number(state?.timestamp ?? NaN);
    if (!Number.isFinite(ts)) {
      return { ok: false, reason: "missing pool timestamp" };
    }
    if (ts < oldest) oldest = ts;
    if (ts > newest) newest = ts;
  }

  const now = Date.now();
  const ageMs = now - newest;
  const skewMs = newest - oldest;

  if (ageMs > ROUTE_STATE_MAX_AGE_MS) {
    return {
      ok: false,
      reason: `route state age ${ageMs}ms > ${ROUTE_STATE_MAX_AGE_MS}ms`,
      ageMs,
      skewMs,
    };
  }

  if (skewMs > ROUTE_STATE_MAX_SKEW_MS) {
    return {
      ok: false,
      reason: `route state skew ${skewMs}ms > ${ROUTE_STATE_MAX_SKEW_MS}ms`,
      ageMs,
      skewMs,
    };
  }

  return { ok: true, ageMs, skewMs };
}

function deriveOnChainMinProfit(assessment) {
  const modeledNet = assessment?.netProfitAfterGas > 0n
    ? assessment.netProfitAfterGas
    : assessment?.netProfit ?? 0n;
  const buffered = modeledNet > 0n ? (modeledNet * 50n) / 100n : 0n;
  return buffered > MIN_PROFIT_WEI ? buffered : MIN_PROFIT_WEI;
}

async function evaluateCandidatesMultiProbe(paths) {
  const byStartToken = new Map();
  for (const path of paths) {
    const token = path.startToken.toLowerCase();
    if (!byStartToken.has(token)) byStartToken.set(token, []);
    byStartToken.get(token).push(path);
  }

  const merged = new Map();
  let totalProbeRuns = 0;
  let skippedProbeRuns = 0;

  for (const [startToken, tokenPaths] of byStartToken) {
    const probeAmounts = getProbeAmountsForToken(startToken);
    let tokenHits = 0;

    for (let i = 0; i < probeAmounts.length; i++) {
      const probeAmount = probeAmounts[i];
      totalProbeRuns++;
      const batch = await evaluatePathsParallel(
        tokenPaths,
        stateCache,
        probeAmount,
        { workerCount: WORKER_COUNT }
      );
      mergeCandidateBatch(merged, batch);
      tokenHits += batch.length;

      // Tokens that produce no profitable quick-pass results in the smallest
      // probe sizes are unlikely to justify paying the full probe fanout.
      if (tokenHits === 0 && i >= 1) {
        skippedProbeRuns += probeAmounts.length - (i + 1);
        break;
      }
    }
  }

  log("[runner] Multi-probe evaluation complete", "debug", {
    event: "multi_probe_summary",
    startTokens: byStartToken.size,
    totalProbeRuns,
    skippedProbeRuns,
    mergedCandidates: merged.size,
  });

  return [...merged.values()].sort((a, b) => {
    if (b.result.profit > a.result.profit) return 1;
    if (b.result.profit < a.result.profit) return -1;
    return 0;
  });
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

function fmtSym(addr) {
  return registry?.getTokenMeta?.(addr)?.symbol ?? addr.slice(2, 8).toUpperCase();
}

function fmtPath(path) {
  const tokens = [path.startToken, ...path.edges.map(e => e.tokenOut)];
  const prots  = path.edges.map(e => e.protocol);
  return `${tokens.map(fmtSym).join('→')}  [${prots.join('/')}]`;
}

function fmtProfit(netWei, tokenAddr) {
  const meta = registry?.getTokenMeta?.(tokenAddr);
  const dec  = meta?.decimals ?? 18;
  const sym  = meta?.symbol   ?? tokenAddr.slice(2, 8).toUpperCase();
  return `${(Number(netWei) / 10 ** dec).toFixed(6)} ${sym}`;
}

function partitionChangedPools(changedPools) {
  const valid = new Set();
  const invalid = new Set();

  for (const addr of changedPools) {
    const state = stateCache.get(addr);
    const verdict = validatePoolState(state);
    if (verdict.valid) {
      valid.add(addr);
    } else {
      invalid.add(addr);
      logger.debug(
        `[runner] Pool ${addr} is currently unroutable: ${verdict.reason ?? "invalid state"}`
      );
    }
  }

  return { valid, invalid };
}

function getRoutablePools(pools) {
  return pools.filter((pool) => {
    const addr = pool.pool_address.toLowerCase();
    return validatePoolState(stateCache.get(addr)).valid;
  });
}

function poolTouchesHubTokens(pool, hubTokens = HUB_4_TOKENS) {
  const tokens = poolTokenList(pool);
  if (!tokens || tokens.length < 2) return false;
  return tokens.slice(0, 2).some((token) => hubTokens.has(token));
}

function admitPoolsToGraphs(poolAddresses) {
  if (!fullGraph || !hubGraph || !poolAddresses || poolAddresses.size === 0) return 0;

  let admitted = 0;
  for (const addr of poolAddresses) {
    if (fullGraph._edgesByPool.has(addr)) continue;

    const pool = registry.getPoolMeta(addr);
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

function removePoolsFromGraphs(poolAddresses) {
  if (!fullGraph || !hubGraph || !poolAddresses || poolAddresses.size === 0) return 0;

  let removed = 0;
  for (const addr of poolAddresses) {
    removed += fullGraph.removePool(addr);
    hubGraph.removePool(addr);
  }

  return removed;
}

// ─── State bootstrapping ──────────────────────────────────────

/**
 * Seed the stateCache from the registry's persisted pool state.
 * All active pools are added — even those without persisted state —
 * so the watcher can write events into them on first arrival.
 */
function seedStateCache() {
  const pools = registry.getPools({ status: "active" });
  let withState = 0;

  for (const pool of pools) {
    const addr = pool.pool_address.toLowerCase();
    if (pool.state?.data) {
      stateCache.set(addr, pool.state.data);
      withState++;
    } else {
      // Placeholder includes identity fields so validatePoolState can progress
      // past the poolId/protocol/tokens checks once the watcher populates the
      // protocol-specific numeric fields (reserve0/reserve1, sqrtPriceX96, etc.).
      let tokens;
      try {
        tokens = typeof pool.tokens === "string" ? JSON.parse(pool.tokens) : pool.tokens;
      } catch { tokens = []; }
      stateCache.set(addr, {
        poolId: addr,
        protocol: pool.protocol,
        tokens: Array.isArray(tokens) ? tokens.map((t) => t.toLowerCase()) : [],
        timestamp: 0,
      });
    }
  }

  log(
    `Seeded stateCache: ${withState} pools with persisted state, ` +
      `${pools.length - withState} empty (${pools.length} total)`,
    "info",
    {
      event: "seed_state_cache",
      activePools: pools.length,
      persistedPools: withState,
      emptyPools: pools.length - withState,
    }
  );
}

// ─── State warmup (initial RPC fetch for pools with no persisted state) ──────

/**
 * Protocol sets used for routing warmup fetches to the correct state fetcher.
 * Mirrors the sets in normalizer.js but kept local to avoid a circular import.
 */
const _WARMUP_V2  = new Set(["QUICKSWAP_V2", "SUSHISWAP_V2", "UNISWAP_V2"]);
const _WARMUP_V3  = new Set(["UNISWAP_V3", "QUICKSWAP_V3", "SUSHISWAP_V3"]);
const _WARMUP_BAL = new Set(["BALANCER_WEIGHTED", "BALANCER_STABLE", "BALANCER_V2"]);
const _WARMUP_CRV = new Set([
  "CURVE_STABLE", "CURVE_CRYPTO", "CURVE_MAIN",
  "CURVE_FACTORY_STABLE", "CURVE_FACTORY_CRYPTO",
  "CURVE_CRYPTO_FACTORY", "CURVE_STABLE_FACTORY",
]);
const WARMUP_PROGRESS_LOG_EVERY = 25;

function warmupProgressSnapshot(stats) {
  const protocolStats = stats.protocols || {};
  return {
    scheduled: stats.scheduled,
    fetched: stats.fetched,
    normalized: stats.normalized,
    disabled: stats.disabled,
    failed: stats.failed,
    remaining: Math.max(0, stats.scheduled - (stats.normalized + stats.disabled + stats.failed)),
    protocols: Object.fromEntries(
      Object.entries(protocolStats).map(([name, protocol]) => [
        name,
        {
          scheduled: protocol.scheduled,
          fetched: protocol.fetched,
          normalized: protocol.normalized,
          disabled: protocol.disabled,
          failed: protocol.failed,
          remaining: Math.max(
            0,
            protocol.scheduled - (protocol.normalized + protocol.disabled + protocol.failed)
          ),
        },
      ])
    ),
  };
}

function logWarmupProgress(stats, phase, meta = undefined) {
  log(`State warmup progress: ${phase}.`, "info", {
    event: "warmup_progress",
    phase,
    ...warmupProgressSnapshot(stats),
    ...(meta || {}),
  });
}

function resolveWarmupPersistBlock() {
  const watcherCheckpoint = registry.getCheckpoint("HYPERSYNC_WATCHER");
  const watcherBlock = Number(watcherCheckpoint?.last_block);
  if (Number.isFinite(watcherBlock) && watcherBlock >= 0) {
    return watcherBlock;
  }

  const globalCheckpoint = registry.getGlobalCheckpoint();
  const globalBlock = Number(globalCheckpoint?.min_block);
  if (Number.isFinite(globalBlock) && globalBlock >= 0) {
    return globalBlock;
  }

  return 0;
}

/**
 * Fetch live state from the chain for a list of pools (grouped by protocol)
 * and write the normalised result directly into stateCache.
 *
 * All four protocol groups are fetched in parallel using the existing
 * batch-RPC helpers (fetchMultipleV2States / fetchMultipleV3States) and the
 * Balancer / Curve single-pool enrichment functions via throttledMap.
 *
 * @param {Array<Object>} pools  Registry pool records to warm up
 */
async function _fetchAndCacheStates(pools) {
  if (!pools.length) {
    return {
      scheduled: 0,
      fetched: 0,
      normalized: 0,
      disabled: 0,
      failed: 0,
      protocols: {},
    };
  }

  const persistedStates = [];
  const persistBlock = resolveWarmupPersistBlock();
  const v2  = pools.filter((p) => _WARMUP_V2.has(p.protocol));
  const v3  = pools.filter((p) => _WARMUP_V3.has(p.protocol));
  const bal = pools.filter((p) => _WARMUP_BAL.has(p.protocol));
  const crv = pools.filter((p) => _WARMUP_CRV.has(p.protocol));
  const stats = {
    scheduled: pools.length,
    fetched: 0,
    normalized: 0,
    disabled: 0,
    failed: 0,
    protocols: {
      v2: { scheduled: v2.length, fetched: 0, normalized: 0, disabled: 0, failed: 0 },
      v3: { scheduled: v3.length, fetched: 0, normalized: 0, disabled: 0, failed: 0 },
      balancer: { scheduled: bal.length, fetched: 0, normalized: 0, disabled: 0, failed: 0 },
      curve: { scheduled: crv.length, fetched: 0, normalized: 0, disabled: 0, failed: 0 },
    },
  };
  logWarmupProgress(stats, "rpc_fetch_started");

  const disableNoDataFailures = (poolGroup, statesMap, sourceLabel, groupStats) => {
    const failures = statesMap?.noDataFailures;
    if (!(failures instanceof Set) || failures.size === 0) return;

    for (const pool of poolGroup) {
      const addr = pool.pool_address.toLowerCase();
      if (!failures.has(addr)) continue;

      registry.disablePool(
        addr,
        `${sourceLabel}: readContract returned no data`
      );
      stateCache.delete(addr);
      groupStats.disabled++;
      stats.disabled++;
      log(`[warmup] Disabled ${addr} after permanent ${sourceLabel} failure.`, "warn", {
        event: "warmup_disable_pool",
        poolAddress: addr,
        source: sourceLabel,
        ...warmupProgressSnapshot(stats),
      });
    }
  };

  await Promise.all([
    // ── V2: batch getReserves() ──────────────────────────────────
    (async () => {
      if (!v2.length) return;
      const statesMap = await fetchMultipleV2States(
        v2.map((p) => p.pool_address),
        V2_POLL_CONCURRENCY
      );
      for (const pool of v2) {
        const addr = pool.pool_address.toLowerCase();
        const raw  = statesMap.get(addr);
        if (!raw) continue;
        stats.protocols.v2.fetched++;
        stats.fetched++;
        let tokens;
        try { tokens = typeof pool.tokens === "string" ? JSON.parse(pool.tokens) : pool.tokens; }
        catch { continue; }
        const normalized = normalizePoolState(addr, pool.protocol, tokens, raw, pool.metadata);
        if (normalized) {
          stateCache.set(addr, normalized);
          persistedStates.push({ pool_address: addr, block: persistBlock, data: normalized });
          stats.protocols.v2.normalized++;
          stats.normalized++;
        }
      }
      disableNoDataFailures(v2, statesMap, "v2 warmup", stats.protocols.v2);
      logWarmupProgress(stats, "v2_complete", {
        protocol: "v2",
      });
    })(),

    // ── V3: batch slot0 + liquidity (+ Algebra globalState) ─────
    (async () => {
      if (!v3.length) return;
      const poolMeta = new Map();
      for (const pool of v3) {
        const meta = typeof pool.metadata === "string"
          ? JSON.parse(pool.metadata || "{}")
          : (pool.metadata || {});
        if (meta.isAlgebra) {
          poolMeta.set(pool.pool_address.toLowerCase(), { isAlgebra: true });
        }
      }
      const statesMap = await fetchMultipleV3States(
        v3.map((p) => p.pool_address),
        V3_POLL_CONCURRENCY,
        poolMeta
      );
      for (const pool of v3) {
        const addr = pool.pool_address.toLowerCase();
        const raw  = statesMap.get(addr);
        if (!raw) continue;
        stats.protocols.v3.fetched++;
        stats.fetched++;
        let tokens;
        try { tokens = typeof pool.tokens === "string" ? JSON.parse(pool.tokens) : pool.tokens; }
        catch { continue; }
        const normalized = normalizePoolState(addr, pool.protocol, tokens, raw, pool.metadata);
        if (normalized) {
          stateCache.set(addr, normalized);
          persistedStates.push({ pool_address: addr, block: persistBlock, data: normalized });
          stats.protocols.v3.normalized++;
          stats.normalized++;
        }
      }
      disableNoDataFailures(v3, statesMap, "v3 warmup", stats.protocols.v3);
      logWarmupProgress(stats, "v3_complete", {
        protocol: "v3",
      });
    })(),

    // ── Balancer: getPoolTokens + getNormalizedWeights ───────────
    (async () => {
      if (!bal.length) return;
      let completed = 0;
      await throttledMap(bal, async (pool) => {
        try {
          const { addr, normalized } = await fetchAndNormalizeBalancerPool(pool);
          stateCache.set(addr, normalized);
          persistedStates.push({ pool_address: addr, block: persistBlock, data: normalized });
          stats.protocols.balancer.fetched++;
          stats.protocols.balancer.normalized++;
          stats.fetched++;
          stats.normalized++;
        } catch {
          stats.protocols.balancer.failed++;
          stats.failed++;
        } finally {
          completed++;
          if (
            completed === bal.length ||
            completed % WARMUP_PROGRESS_LOG_EVERY === 0
          ) {
            logWarmupProgress(stats, "balancer_progress", {
              protocol: "balancer",
              completed,
              total: bal.length,
            });
          }
        }
      }, ENRICH_CONCURRENCY);
    })(),

    // ── Curve: get_balances + A + fee ────────────────────────────
    (async () => {
      if (!crv.length) return;
      let completed = 0;
      await throttledMap(crv, async (pool) => {
        try {
          const { addr, normalized } = await fetchAndNormalizeCurvePool(pool);
          stateCache.set(addr, normalized);
          persistedStates.push({ pool_address: addr, block: persistBlock, data: normalized });
          stats.protocols.curve.fetched++;
          stats.protocols.curve.normalized++;
          stats.fetched++;
          stats.normalized++;
        } catch {
          stats.protocols.curve.failed++;
          stats.failed++;
        } finally {
          completed++;
          if (
            completed === crv.length ||
            completed % WARMUP_PROGRESS_LOG_EVERY === 0
          ) {
            logWarmupProgress(stats, "curve_progress", {
              protocol: "curve",
              completed,
              total: crv.length,
            });
          }
        }
      }, ENRICH_CONCURRENCY);
    })(),
  ]);

  if (persistedStates.length > 0) {
    registry.batchUpdateStates(persistedStates);
  }

  return stats;
}

/**
 * Returns true only when BOTH tokens of a pool are in the given hub set.
 *
 * Pools where only one token is a hub token are intentionally excluded from
 * the synchronous warmup: "hub-touching" (one side) matches ~89 % of all
 * Polygon pools and would require fetching 100k+ contracts at startup.
 * "Hub-pair" (both sides) covers only the direct routes between the most
 * liquid tokens (WMATIC↔WETH, WMATIC↔USDC, WETH↔USDT, …) — a few hundred
 * pools that form the skeleton of every profitable cycle.
 *
 * @param {Object}      pool       Registry pool record
 * @param {Set<string>} hubTokens  Lowercase hub-token addresses
 * @returns {boolean}
 */
function poolBothTokensAreHubs(pool, hubTokens) {
  const tokens = poolTokenList(pool);
  if (!tokens || tokens.length < 2) return false;
  return hubTokens.has(tokens[0]) && hubTokens.has(tokens[1]);
}

function warmupPriority(pool) {
  const tokens = poolTokenList(pool);
  const bothCoreHubs =
    tokens.length >= 2 &&
    HUB_4_TOKENS.has(tokens[0]) &&
    HUB_4_TOKENS.has(tokens[1]);

  let protocolRank = 3;
  if (_WARMUP_V2.has(pool.protocol)) protocolRank = 0;
  else if (_WARMUP_V3.has(pool.protocol)) protocolRank = 1;
  else if (_WARMUP_BAL.has(pool.protocol)) protocolRank = 2;

  return [bothCoreHubs ? 0 : 1, protocolRank, pool.pool_address.toLowerCase()];
}

function compareWarmupPriority(a, b) {
  const left = warmupPriority(a);
  const right = warmupPriority(b);
  for (let i = 0; i < left.length; i++) {
    if (left[i] < right[i]) return -1;
    if (left[i] > right[i]) return 1;
  }
  return 0;
}

/**
 * Warm up the stateCache by fetching live on-chain state for pools that
 * currently hold only identity-field placeholders (no valid numeric state).
 *
 * Strategy:
 *   1. **Hub-pair pools** (both tokens in POLYGON_HUB_TOKENS) are fetched
 *      synchronously before the first refreshCycles() call.  These are the
 *      ~few-hundred pools that directly connect the most liquid tokens and
 *      form the backbone of every arb cycle.
 *   2. **All other pools** are populated incrementally by the StateWatcher,
 *      which replays the last WATCHER_LOOKBACK_BLOCKS blocks on startup and
 *      fires watcher.onBatch → admitPoolsToGraphs for every valid state
 *      update.  No background RPC fetch is needed for this tier.
 */
async function warmupStateCache() {
  const activePools = registry.getActivePoolsMeta();
  const needsState  = activePools.filter(
    (p) => !validatePoolState(stateCache.get(p.pool_address.toLowerCase())).valid
  );

  if (needsState.length === 0) {
    log("State cache already warm — skipping warmup.", "info", {
      event: "warmup_skip",
      reason: "state_cache_already_warm",
    });
    return;
  }

  // Only the direct hub↔hub pairs are fetched synchronously.
  const hubPairPools = needsState.filter((p) => poolBothTokensAreHubs(p, POLYGON_HUB_TOKENS));

  if (hubPairPools.length === 0) {
    log("State warmup: no hub-pair pools without state — watcher will populate the rest.", "info", {
      event: "warmup_skip",
      reason: "no_hub_pair_pools_without_state",
      needsState: needsState.length,
    });
    return;
  }

  const prioritizedHubPairPools = [...hubPairPools].sort(compareWarmupPriority);
  const syncWarmupPools = prioritizedHubPairPools.slice(0, MAX_SYNC_WARMUP_POOLS);
  const deferredPools = hubPairPools.length - syncWarmupPools.length;

  if (syncWarmupPools.length === 0) {
    log("State warmup: synchronous warmup budget is 0 — watcher will populate hub pairs.", "info", {
      event: "warmup_skip",
      reason: "sync_warmup_budget_zero",
      hubPairPools: hubPairPools.length,
    });
    return;
  }

  log(`State warmup: fetching ${syncWarmupPools.length}/${hubPairPools.length} hub-pair pools via RPC (sync)...`, "info", {
    event: "warmup_start",
    needsState: needsState.length,
    hubPairPools: hubPairPools.length,
    syncWarmupPools: syncWarmupPools.length,
    deferredPools,
    maxSyncWarmupPools: MAX_SYNC_WARMUP_POOLS,
    protocolBreakdown: {
      v2: syncWarmupPools.filter((pool) => _WARMUP_V2.has(pool.protocol)).length,
      v3: syncWarmupPools.filter((pool) => _WARMUP_V3.has(pool.protocol)).length,
      balancer: syncWarmupPools.filter((pool) => _WARMUP_BAL.has(pool.protocol)).length,
      curve: syncWarmupPools.filter((pool) => _WARMUP_CRV.has(pool.protocol)).length,
    },
  });
  const warmupStats = await _fetchAndCacheStates(syncWarmupPools);

  const valid = syncWarmupPools.filter(
    (p) => validatePoolState(stateCache.get(p.pool_address.toLowerCase())).valid
  ).length;
  log(`State warmup complete: ${valid}/${syncWarmupPools.length} sync hub-pair pools routable.`, "info", {
    event: "warmup_complete",
    hubPairPools: hubPairPools.length,
    syncWarmupPools: syncWarmupPools.length,
    deferredPools,
    routablePools: valid,
    unroutablePools: syncWarmupPools.length - valid,
    warmupStats,
  });
  // Non-hub-pair pools: the StateWatcher's 100-block lookback replay will
  // emit onBatch events for every recently active pool; admitPoolsToGraphs
  // and the debounced arb loop handle admission without an explicit RPC pass.
}

// ─── Background discovery ──────────────────────────────────────

async function maybeRunDiscovery(force = false) {
  const now = Date.now();
  if (discoveryInFlight) return null;
  if (!force && now - lastDiscoveryMs < DISCOVERY_INTERVAL_MS) return null;

  discoveryInFlight = true;
  lastDiscoveryMs   = now;

  try {
    log("Background discovery starting...", "info", {
      event: "discovery_start",
      forced: force,
    });
    const result = await discoverPools();
    log(`Background discovery complete: ${result.totalDiscovered} new pools`, "info", {
      event: "discovery_complete",
      forced: force,
      totalDiscovered: result.totalDiscovered,
      activePools: result.activePools,
    });
    return result;
  } catch (err) {
    log(`Background discovery failed: ${err.message}`, "warn", {
      event: "discovery_failed",
      forced: force,
      err,
    });
    return null;
  } finally {
    discoveryInFlight = false;
  }
}

// ─── Cycle enumeration ────────────────────────────────────────

async function refreshCycles(force = false) {
  // Skip if already built and not forced — graph state stays live via stateRefs.
  // Only rebuild topology (force=true) when new pools are discovered.
  if (!force && !topologyDirty && cachedCycles.length > 0) return;

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
  const activePools = registry.getActivePoolsMeta();
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

  const rebuildGraphs = force || !fullGraph || !hubGraph;

  // Build graphs only when absent or explicitly forced. For watcher-driven
  // admissions/removals we mutate the live graphs in place and only need
  // to re-enumerate cycles against the updated adjacency.
  if (rebuildGraphs) {
    fullGraph = buildGraph(pools, stateCache);
    hubGraph  = buildHubGraph(pools, HUB_4_TOKENS, stateCache);
    invalidateSerializedTopologies();
  }
  const topologyKeyBase = `topology:${++topologyVersion}`;

  // $5k USD ≈ 7 143 WMATIC ≈ 7_143n * 10n**18n at $0.70/WMATIC
  const MIN_LIQ_WMATIC = 7_143n * 10n ** 18n;

  // getRateWei bridges priceOracle into the enumerate options
  const getRateWei = priceOracle
    ? (addr) => priceOracle.getRate(addr)
    : null;

  if (WORKER_COUNT >= 2 && workerPool._initialized) {
    // Offload enumeration to workers: split HUB_4_TOKENS tokens across threads
    const hubTopo    = getSerializedTopologyCached("hub", hubGraph);
    const fullTopo   = getSerializedTopologyCached("full", fullGraph);
    const hubTokens  = [...HUB_4_TOKENS].filter((t) => hubGraph.hasToken(t));
    // Full-graph enumeration starts only from POLYGON_HUB_TOKENS to bound search space
    const fullTokens = [...POLYGON_HUB_TOKENS].filter((t) => fullGraph.hasToken(t));

    const [hubSer, fullSer] = await Promise.all([
      workerPool.enumerate(hubTopo, hubTokens, {
        include2Hop: true, include3Hop: true, include4Hop: true,
        maxPathsPerToken: Math.ceil(MAX_TOTAL_PATHS * 0.6 / Math.max(hubTokens.length, 1)),
        max4HopPathsPerToken: 2_000,
        topologyKey: `${topologyKeyBase}:hub`,
      }),
      workerPool.enumerate(fullTopo, fullTokens, {
        include2Hop: true, include3Hop: true, include4Hop: false,
        maxPathsPerToken: Math.ceil(MAX_TOTAL_PATHS * 0.4 / Math.max(fullTokens.length, 1)),
        topologyKey: `${topologyKeyBase}:full`,
      }),
    ]);

    // Re-hydrate serialised paths back to full edge objects from live graphs
    cachedCycles = _hydratePaths([...hubSer, ...fullSer], hubGraph, fullGraph);
  } else {
    // Synchronous enumeration on main thread
    cachedCycles = enumerateCyclesDual(hubGraph, fullGraph, {
      include2Hop:          true,
      include3Hop:          true,
      maxPathsPerToken:     Math.ceil(MAX_TOTAL_PATHS / 7),
      max4HopPathsPerToken: 2_000,
      maxTotalPaths:        MAX_TOTAL_PATHS,
      minLiquidityWmatic:   getRateWei ? MIN_LIQ_WMATIC : 0n,
      getRateWei,
    });
  }

  // Prune stale cached routes after topology rebuild
  routeCache.prune(stateCache);
  topologyDirty = false;

  log(`Cycle refresh: ${cachedCycles.length} paths (hub+full, max ${MAX_TOTAL_PATHS}).`, "info", {
    event: "cycle_refresh_complete",
    forced: force,
    topologyVersion,
    cachedPaths: cachedCycles.length,
    maxTotalPaths: MAX_TOTAL_PATHS,
    routeCacheSize: routeCache._routes?.length,
  });
  } finally {
    cycleRefreshRunning = false;
  }
}

/**
 * Re-hydrate serialised path descriptors (from workers) back to full ArbPath
 * objects with live edge references from the in-memory graphs.
 *
 * @param {Array<{startToken,poolAddresses,zeroForOnes,hopCount,logWeight,cumulativeFeesBps}>} serialised
 * @param {import('./src/routing/graph.ts').RoutingGraph} hub
 * @param {import('./src/routing/graph.ts').RoutingGraph} full
 * @returns {import('./src/routing/finder.ts').ArbPath[]}
 */
function _hydratePaths(serialised, hub, full) {
  const paths = [];
  const seen  = new Set();

  for (const s of serialised) {
    const key = [
      s.startToken.toLowerCase(),
      ...s.poolAddresses.map((pool, i) =>
        `${pool.toLowerCase()}:${s.zeroForOnes[i] ? "1" : "0"}`
      ),
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);

    // Try hub graph first (has stateRefs for hub pools), fall back to full
    const edges = [];
    let ok = true;
    for (let i = 0; i < s.poolAddresses.length; i++) {
      const pool = s.poolAddresses[i];
      const zfo  = s.zeroForOnes[i];
      const candidate =
        hub.getPoolEdge(pool, zfo) ||
        full.getPoolEdge(pool, zfo);
      if (!candidate) { ok = false; break; }
      edges.push(candidate);
    }

    if (ok && edges.length === s.poolAddresses.length) {
      paths.push({
        startToken:        s.startToken,
        edges,
        hopCount:          s.hopCount,
        logWeight:         s.logWeight,
        cumulativeFeesBps: s.cumulativeFeesBps,
      });
    }
  }

  // Sort most-profitable first
  paths.sort((a, b) => (a.logWeight || 0) - (b.logWeight || 0));
  if (paths.length > MAX_TOTAL_PATHS) return paths.slice(0, MAX_TOTAL_PATHS);
  return paths;
}

// ─── Arb search ────────────────────────────────────────────────

async function findArbs() {
  if (topologyDirty || cachedCycles.length === 0) await refreshCycles();
  if (cachedCycles.length === 0) return [];

  const candidates = await evaluateCandidatesMultiProbe(cachedCycles);

  pathsEvaluated.inc({ pass: passCount }, cachedCycles.length);

  log(
    candidates.length === 0
      ? `Scanned ${cachedCycles.length} paths — no candidates above fee threshold`
      : `Scanned ${cachedCycles.length} paths → ${candidates.length} candidates`,
    "info",
    { event: "scan_summary", paths: cachedCycles.length, candidates: candidates.length }
  );

  if (candidates.length === 0) return [];

  const feeSnapshot = await getCurrentFeeSnapshot();
  const gasPriceWei = feeSnapshot?.maxFee ?? 50n * 10n ** 9n;

  const profitable = [];
  const topCandidates = selectOptimizationCandidates(candidates, MAX_PATHS_TO_OPTIMIZE);
  const bestQuickProfit = topCandidates[0]?.result?.profit ?? 0n;
  let optimizedCandidates = 0;

  for (let i = 0; i < topCandidates.length; i++) {
    const { path, result: quickResult } = topCandidates[i];
    const tokenToMaticRate = getFreshTokenToMaticRate(path.startToken);
    if (tokenToMaticRate <= 0n) continue;
    let optimized = quickResult;
    if (shouldOptimizeCandidate(topCandidates[i], i, topCandidates.length, bestQuickProfit)) {
      optimizedCandidates++;
      optimized = optimizeInputAmount(
        path,
        stateCache,
        getAssessmentOptimizationOptions(path, quickResult, gasPriceWei, tokenToMaticRate)
      ) || quickResult;
    }
    const assessment = computeProfit(optimized, {
      gasPriceWei,
      tokenToMaticRate,
      slippageBps:    50n,
      revertRiskBps:  500n,
      minNetProfit:   MIN_PROFIT_WEI,
      hopCount:       path.hopCount,
    });

    if (assessment.shouldExecute) {
      profitable.push({ path, result: optimized, assessment });
    }
  }

  if (profitable.length > 0) {
    arbsFound.inc({ pass: passCount }, profitable.length);
    routeCache.update(profitable);
    for (const { path, assessment } of profitable) {
      const net = assessment.netProfitAfterGas ?? assessment.netProfit ?? 0n;
      log(
        `  ↳ ${fmtPath(path)}  net ${fmtProfit(net, path.startToken)}`,
        "info",
        {
          event: "profitable_route",
          route: fmtPath(path),
          hopCount: path.hopCount,
          netProfit: net.toString(),
        }
      );
    }
  }

  log("[runner] Candidate optimization pass complete", "debug", {
    event: "candidate_optimization_summary",
    candidates: candidates.length,
    topCandidates: topCandidates.length,
    optimizedCandidates,
    skippedOptimization: topCandidates.length - optimizedCandidates,
    profitableRoutes: profitable.length,
  });

  profitable.sort((a, b) => (b.assessment.netProfit > a.assessment.netProfit ? 1 : -1));
  return profitable;
}

// ─── Fast revalidation (event-driven) ────────────────────────

/**
 * Re-simulate only the cached routes whose pools changed in this batch.
 * Much cheaper than a full arb scan — runs synchronously on the main thread.
 * If any route is still profitable, execute it immediately.
 *
 * @param {Set<string>} changedPools  Lowercase pool addresses from watcher batch
 */
async function revalidateCachedRoutes(changedPools) {
  const affected = routeCache.getByPools(changedPools);
  if (affected.length === 0) return;

  log(`[fast-revalidate] ${affected.length} cached route(s) for ${changedPools.size} changed pool(s)`, "debug", {
    event: "fast_revalidate_start",
    affectedRoutes: affected.length,
    changedPools: changedPools.size,
  });

  const feeSnapshot = await getCurrentFeeSnapshot();
  const gasPriceWei = feeSnapshot?.maxFee ?? 50n * 10n ** 9n;

  const profitable = [];
  let quickRejected = 0;
  let optimizedRoutes = 0;
  for (const { path, result: prev } of affected) {
    const tokenToMaticRate = getFreshTokenToMaticRate(path.startToken);
    if (tokenToMaticRate <= 0n) continue;

    // Reuse the previously sized input first; most stale routes can be ruled
    // out with one simulation instead of paying for ternary search.
    const quickResult = simulateRoute(
      path,
      prev?.amountIn ?? TEST_AMOUNT_WEI,
      stateCache
    );
    const quickAssessment = assessRouteResult(
      path,
      quickResult,
      gasPriceWei,
      tokenToMaticRate
    );
    if (!quickAssessment.shouldExecute) {
      quickRejected++;
      continue;
    }

    const freshness = getPathFreshness(path);
    if (!freshness.ok) {
      log(`[fast-revalidate] Skipping stale route: ${freshness.reason}`, "debug", {
        event: "fast_revalidate_skip_stale",
        reason: freshness.reason,
        hopCount: path.hopCount,
      });
      continue;
    }

    optimizedRoutes++;
    const optimized = optimizeInputAmount(
      path,
      stateCache,
      getAssessmentOptimizationOptions(path, prev, gasPriceWei, tokenToMaticRate)
    ) || quickResult;
    if (!optimized?.profitable) continue;

    const assessment = assessRouteResult(
      path,
      optimized,
      gasPriceWei,
      tokenToMaticRate
    );
    if (assessment.shouldExecute) profitable.push({ path, result: optimized, assessment });
  }

  log("[runner] Fast revalidation summary", "debug", {
    event: "fast_revalidate_summary",
    affectedRoutes: affected.length,
    quickRejected,
    optimizedRoutes,
    profitableRoutes: profitable.length,
  });

  if (profitable.length > 0) {
    profitable.sort((a, b) => (b.assessment.netProfit > a.assessment.netProfit ? 1 : -1));
    log(`[fast-revalidate] ${profitable.length} opportunity(ies) — executing best`, "info", {
      event: "fast_revalidate_execute",
      profitableRoutes: profitable.length,
    });
    await execute(profitable[0]);
  }
}

// ─── Execution ────────────────────────────────────────────────

async function execute(best) {
  if (!LIVE_MODE) {
    log(`[DRY-RUN] Would execute: profit=${best.assessment.netProfit} net`, "info", () => ({
      event: "execute_dry_run",
      hopCount: best.path.hopCount,
      netProfit: best.assessment.netProfit.toString(),
      roi: best.assessment.roi?.toString?.() ?? String(best.assessment.roi),
    }));
    return { submitted: false, dryRun: true };
  }

  if (!PRIVATE_KEY || !EXECUTOR_ADDRESS) {
    log("[SKIP] PRIVATE_KEY and EXECUTOR_ADDRESS required for --live", "warn", {
      event: "execute_skip",
      reason: "missing_live_config",
    });
    return { submitted: false, error: "missing config" };
  }

  try {
    const { privateKeyToAccount } = await import("viem/accounts");
    const account = privateKeyToAccount(PRIVATE_KEY);

    const onChainMinProfit = deriveOnChainMinProfit(best.assessment);
    const builtTx = await buildArbTx(
      best,
      { executorAddress: EXECUTOR_ADDRESS, fromAddress: account.address },
      { minProfit: onChainMinProfit, slippageBps: 50, gasMultiplier: 1.3 }
    );

    const actualGasUnits = Number(builtTx.gasLimit);
    const tokenToMaticRate = getFreshTokenToMaticRate(best.path.startToken);
    if (tokenToMaticRate <= 0n) {
      log("[SKIP] Post-build price check failed: stale or missing token/MATIC rate", "warn", {
        event: "execute_skip",
        reason: "stale_or_missing_token_matic_rate",
      });
      return { submitted: false, error: "stale or missing token/MATIC rate" };
    }
    const postBuildAssessment = computeProfit(
      { ...best.result, totalGas: actualGasUnits },
      {
        gasPriceWei: builtTx.maxFeePerGas,
        tokenToMaticRate,
        slippageBps: 50n,
        revertRiskBps: 500n,
        minNetProfit: MIN_PROFIT_WEI,
        hopCount: best.path.hopCount,
      }
    );

    if (!postBuildAssessment.shouldExecute) {
      log(
        `[SKIP] Post-build profit check failed: ${postBuildAssessment.rejectReason}`,
        "info",
        () => ({
          event: "execute_skip",
          reason: "post_build_profit_check_failed",
          rejectReason: postBuildAssessment.rejectReason,
          hopCount: best.path.hopCount,
          preNetProfitAfterGas: best.assessment.netProfitAfterGas?.toString?.(),
          postNetProfitAfterGas: postBuildAssessment.netProfitAfterGas?.toString?.(),
        })
      );
      return {
        submitted: false,
        error: `post-build profit check failed: ${postBuildAssessment.rejectReason}`,
      };
    }

    log(
      `[drift] pre=${best.assessment.netProfitAfterGas} post=${postBuildAssessment.netProfitAfterGas} onChainMin=${onChainMinProfit}`,
      "info",
      () => ({
        event: "execute_drift_check",
        hopCount: best.path.hopCount,
        preNetProfitAfterGas: best.assessment.netProfitAfterGas?.toString?.(),
        postNetProfitAfterGas: postBuildAssessment.netProfitAfterGas?.toString?.(),
        onChainMinProfit: onChainMinProfit.toString(),
      })
    );

    return await sendTx(builtTx, {
      privateKey:   PRIVATE_KEY,
      rpcUrl:       POLYGON_RPC,
      nonceManager,
    });
  } catch (err) {
    log(`Execution error: ${err.message}`, "error", {
      event: "execute_error",
      err,
    });
    return { submitted: false, error: err.message };
  }
}

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
    maybeRunDiscovery().then(async (result) => {
      if (result?.totalDiscovered > 0) {
        // Seed stateCache for new pools and extend the HyperSync stream filter
        const allPools = registry.getActivePoolsMeta();
        const newPools = allPools.filter(
          (p) => !stateCache.has(p.pool_address.toLowerCase())
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
            watcher.addPools(newPools.map((p) => p.pool_address.toLowerCase()));
          }
          // Fetch live state for newly discovered pools before rebuilding topology
          await _fetchAndCacheStates(newPools);
        }
        // Rebuild cycle topology with the new pool set
        topologyDirty = true;
        await refreshCycles(true);
      }
    }).catch((err) => {
      log(`Background discovery error: ${err?.message ?? err}`, "warn", {
        event: "discovery_bg_error",
        err,
      });
    });

    // Refresh cycles if not yet built
    await refreshCycles();

    // Update price oracle from live state
    priceOracle.update();

    const opportunities = await findArbs();
    botState.passCount         = passCount;
    botState.consecutiveErrors = consecutiveErrors;
    botState.opportunities     = opportunities.slice(0, 5).map(o => ({
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
      log("Executing best opportunity...", "info", {
        event: "pass_execute_best",
        pass: passCount,
      });
      await execute(opportunities[0]);
    }

    log(`Pass #${passCount} complete in ${formatDuration(Date.now() - t0)}`, "info", {
      event: "pass_complete",
      pass: passCount,
      durationMs: Date.now() - t0,
      opportunities: opportunities.length,
    });
    consecutiveErrors = 0;
  } catch (err) {
    log(`Pass #${passCount} failed: ${err.message}`, "error", {
      event: "pass_failed",
      pass: passCount,
      consecutiveErrors: consecutiveErrors + 1,
      err,
    });
    console.error(err);
    consecutiveErrors++;
    if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
      log(`${MAX_CONSECUTIVE_ERRORS} consecutive errors — backing off 30s`, "warn");
      await runnerSleep(30_000);
      consecutiveErrors = 0;
    }
  }
}

// ─── Debounced arb trigger ────────────────────────────────────

/**
 * Schedule an arb scan.
 *
 * Coalesces multiple back-to-back HyperSync batches into a single evaluation:
 * if a scan is already pending, the call is ignored. Otherwise, the scan fires
 * after ARB_DEBOUNCE_MS — long enough for a burst of events to land.
 */
function scheduleArb() {
  if (!running) return;
  if (_arbQueued || _arbRunning) {
    _arbDirty = true;
    return;
  }

  const delay = Math.max(0, ARB_DEBOUNCE_MS - (Date.now() - _lastArbMs));
  _arbQueued = true;

  setTimeout(async () => {
    _arbQueued = false;
    _lastArbMs = Date.now();

    if (_arbRunning) {
      _arbDirty = true;
      return;
    }

    _arbRunning = true;
    try {
      await runPass();
    } finally {
      _arbRunning = false;
      if (_arbDirty && running) {
        _arbDirty = false;
        scheduleArb();
      }
    }
  }, delay);
}

// ─── Shutdown ──────────────────────────────────────────────────

async function shutdown() {
  log("Shutdown signal received...");
  running = false;
  if (watcher) await watcher.stop();
  if (gasOracle) gasOracle.stop();
  if (registry) registry.close();
  await workerPool.terminate();
  stopMetricsServer();
  process.exit(0);
}

// ─── Main ──────────────────────────────────────────────────────

async function main() {
  botState.status = 'running';

  if (TUI_MODE) {
    startTui(botState);
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
  log("Initial pool discovery...");
  try {
    const result = await discoverPools();
    lastDiscoveryMs = Date.now();
    log(`Discovery: ${result.totalDiscovered} new, ${result.activePools} active`);
  } catch (err) {
    log(`Initial discovery failed: ${err.message} — using cached state`, "warn");
  }

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

  watcher = new StateWatcher(registry, stateCache);

  // Wire real-time event trigger:
  //   1. Fast revalidation — re-simulate cached routes for changed pools (sync, cheap)
  //   2. Debounced full scan — full cycle evaluation coalescing rapid batches
  watcher.onBatch = (changedAddrs) => {
    const { valid: validChangedAddrs, invalid: invalidChangedAddrs } =
      partitionChangedPools(changedAddrs);
    if (validChangedAddrs.size === 0 && invalidChangedAddrs.size === 0) {
      log("[runner] No usable pool changes in watcher batch", "debug", {
        event: "watcher_batch_skip",
        changedPools: changedAddrs.size,
      });
      return;
    }

    if (invalidChangedAddrs.size > 0) {
      const removedEdges = removePoolsFromGraphs(invalidChangedAddrs);
      log(
        `[runner] ${invalidChangedAddrs.size} pool(s) became unroutable; ` +
        `${removedEdges / 2} removed from topology.`,
        "info",
        {
          event: "watcher_batch_remove_unroutable",
          changedPools: changedAddrs.size,
          invalidPools: invalidChangedAddrs.size,
          removedPools: removedEdges / 2,
        }
      );
      const removedRoutes = routeCache.removeByPools(invalidChangedAddrs);
      invalidateSerializedTopologies();
      topologyDirty = true;
      log("[runner] Marked topology dirty after unroutable pool removal", "debug", {
        event: "topology_dirty",
        reason: "unroutable_pool_removed",
        invalidPools: invalidChangedAddrs.size,
        removedRoutes,
      });
    }

    if (validChangedAddrs.size > 0) {
      log(
        `[watcher] ${validChangedAddrs.size}/${changedAddrs.size} pool state(s) updated`,
        "info",
        {
          event: "watcher_batch_valid",
          changedPools: changedAddrs.size,
          validPools: validChangedAddrs.size,
        }
      );
      const admitted = admitPoolsToGraphs(validChangedAddrs);
      if (admitted > 0) {
        log(`[runner] Admitted ${admitted} newly routable pool(s); refreshing cycles soon.`, "info", {
          event: "watcher_batch_admit",
          changedPools: changedAddrs.size,
          validPools: validChangedAddrs.size,
          admittedPools: admitted,
        });
        topologyDirty = true;
        invalidateSerializedTopologies();
        log("[runner] Marked topology dirty after admitting new pools", "debug", {
          event: "topology_dirty",
          reason: "new_pools_admitted",
          admittedPools: admitted,
        });
      }
      // Fast path: re-evaluate cached profitable routes touching changed pools
      revalidateCachedRoutes(validChangedAddrs).catch((err) => {
        log(`Route revalidation error: ${err?.message ?? err}`, "warn", {
          event: "revalidate_error",
          err,
        });
      });
    }

    // Slow path: full debounced arb scan
    scheduleArb();
  };

  watcher.onReorg = ({ reorgBlock, changedAddrs }) => {
    log(
      `[runner] Reorg rollback to block ${reorgBlock}; clearing cached routes and topology`,
      "warn",
      {
        event: "watcher_reorg",
        reorgBlock,
        changedPools: changedAddrs?.size ?? 0,
      }
    );
    routeCache.clear();
    cachedCycles = [];
    hubGraph = null;
    fullGraph = null;
    invalidateSerializedTopologies();
    topologyDirty = true;
    if (changedAddrs?.size) {
      log(`[runner] Reorg cache reload touched ${changedAddrs.size} active pool(s)`, "debug", {
        event: "watcher_reorg_reload",
        changedPools: changedAddrs.size,
      });
    }
    scheduleArb();
  };

  log(`Starting HyperSync stream (debounce: ${ARB_DEBOUNCE_MS}ms, heartbeat: ${formatDuration(HEARTBEAT_INTERVAL_MS)})...`, "info", {
    event: "watcher_start",
    debounceMs: ARB_DEBOUNCE_MS,
    heartbeatMs: HEARTBEAT_INTERVAL_MS,
  });
  await watcher.start();

  // Heartbeat: guarantee a scan even if the market is quiet
  const heartbeat = setInterval(scheduleArb, HEARTBEAT_INTERVAL_MS);

  // Run one pass immediately so we don't wait for the first event
  scheduleArb();

  // Block until watcher stops (stop() resolves _loopPromise)
  await watcher.wait();
  clearInterval(heartbeat);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
