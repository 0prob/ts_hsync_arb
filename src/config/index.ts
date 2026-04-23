
/**
 * src/config/index.js — Centralized configuration
 *
 * Single source of truth for all environment variables, constants,
 * and tunable parameters. Every other module imports from here.
 *
 * Parameter resolution order (highest wins):
 *   1. Environment variables (UPPERCASE names)
 *   2. data/perf.json  (written by scripts/tune_performance.js)
 *   3. Built-in defaults  (safe conservative values)
 *
 * Run `node scripts/tune_performance.js` once after deployment to
 * generate data/perf.json with machine-optimal values.
 */

import os from "os";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Paths ─────────────────────────────────────────────────────

/** Project root (two levels up from src/config/) */
export const PROJECT_ROOT = path.resolve(__dirname, "..", "..");

/** Runtime data directory (SQLite DB, snapshots, perf.json) */
export const DATA_DIR = path.join(PROJECT_ROOT, "data");

/** SQLite database path */
export const DB_PATH = path.join(DATA_DIR, "registry.db");

/** ABI directory */
export const ABI_DIR = path.join(PROJECT_ROOT, "abi");

// ─── Auto-tuned parameter loader ──────────────────────────────
//
// Reads data/perf.json if it exists.  The file is produced by
// `node scripts/tune_performance.js` and contains optimal values
// for the current machine.  Env vars always override these values.

function _loadPerfJson() {
  try {
    const p = path.join(DATA_DIR, "perf.json");
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, "utf8")).params || {};
    }
  } catch { /* ignore parse errors */ }
  return {};
}

const _perf = _loadPerfJson();

/**
 * Resolve a numeric parameter.
 * Priority: env var → perf.json → built-in default.
 *
 * @param {string} envKey   Environment variable name
 * @param {string} perfKey  Key inside perf.json params object
 * @param {number} def      Built-in default
 */
function _num(envKey: string, perfKey: string, def: number): number {
  if (process.env[envKey] != null && process.env[envKey] !== "") {
    const n = Number(process.env[envKey]);
    if (Number.isFinite(n)) return n;
    console.warn(`[config] Invalid numeric env ${envKey}=${process.env[envKey]} — using fallback`);
  }
  if (_perf[perfKey] != null) {
    const n = Number(_perf[perfKey]);
    if (Number.isFinite(n)) return n;
    console.warn(`[config] Invalid numeric perf.json value for ${perfKey}=${_perf[perfKey]} — using fallback`);
  }
  return def;
}

function _addressList(envKey: string): string[] {
  const raw = process.env[envKey] || "";
  if (!raw) return [];
  return raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => /^0x[0-9a-f]{40}$/.test(entry));
}

// ─── HyperSync ─────────────────────────────────────────────────

function withEnvioToken(rawUrl: string, token: string) {
  if (!rawUrl || !token) return rawUrl;

  try {
    const url = new URL(rawUrl);
    const isHostedHypersync =
      url.protocol.startsWith("http") &&
      (url.hostname.endsWith(".hypersync.xyz") || url.hostname === "hypersync.xyz");

    if (!isHostedHypersync) return rawUrl;
    if (url.username || url.password) return rawUrl;
    if (url.searchParams.has("api_key") || url.searchParams.has("apiKey") || url.searchParams.has("token")) {
      return rawUrl;
    }

    return `${url.protocol}//${encodeURIComponent(token)}@${url.host}${url.pathname}${url.search}${url.hash}`;
  } catch {
    return rawUrl;
  }
}

// Direct HyperSync streaming endpoint — used by the StateWatcher native client.
// Uses its own binary protocol, not standard JSON-RPC.
export const HYPERSYNC_URL =
  process.env.HYPERSYNC_URL || "https://polygon.hypersync.xyz";

export const ENVIO_API_TOKEN = process.env.ENVIO_API_TOKEN || "";

// HyperRPC JSON-RPC endpoint — used exclusively for multicall token metadata
// hydration so batch reads don't compete with hot-path RPC scoring.
// Hosted *.rpc.hypersync.xyz endpoints automatically inherit ENVIO_API_TOKEN.
// Local/custom endpoints are left untouched.
export const HYPERRPC_URL = withEnvioToken(
  process.env.HYPERRPC_URL || "https://polygon.rpc.hypersync.xyz",
  ENVIO_API_TOKEN,
);

if (!ENVIO_API_TOKEN) {
  console.warn(
    "WARNING: ENVIO_API_TOKEN not set. HyperSync streaming (StateWatcher) will reject requests.\n" +
    "         Set ENVIO_API_TOKEN in .env."
  );
}

/** Max number of logs to fetch in a single HyperSync batch */
export const HYPERSYNC_BATCH_SIZE = _num("HYPERSYNC_BATCH_SIZE", "HYPERSYNC_BATCH_SIZE", 5000);

/**
 * Max number of blocks a single historical HyperSync `get()` page may scan.
 * Bounding block span keeps sparse backfills within HyperSync's query-time budget.
 */
export const HYPERSYNC_MAX_BLOCKS_PER_REQUEST = _num(
  "HYPERSYNC_MAX_BLOCKS_PER_REQUEST",
  "HYPERSYNC_MAX_BLOCKS_PER_REQUEST",
  1_000_000
);

/** Max number of addresses to include in a HyperSync filter before falling back to topic-only */
export const HYPERSYNC_MAX_ADDRESS_FILTER = _num("HYPERSYNC_MAX_ADDRESS_FILTER", "HYPERSYNC_MAX_ADDRESS_FILTER", 1000);

/**
 * Max number of log filters to include in a single watcher `get()` request.
 * Splitting large watchlists across multiple requests avoids HyperSync payload
 * limits once the bot tracks many pools.
 */
export const HYPERSYNC_MAX_FILTERS_PER_REQUEST = _num(
  "HYPERSYNC_MAX_FILTERS_PER_REQUEST",
  "HYPERSYNC_MAX_FILTERS_PER_REQUEST",
  8
);

// ─── Discovery ─────────────────────────────────────────────────

/** Block number to start discovery from if no checkpoint exists */
export const GENESIS_START_BLOCK = _num("GENESIS_START_BLOCK", "GENESIS_START_BLOCK", 44_000_000);

/** Interval between background pool discovery runs (ms) */
export const DISCOVERY_INTERVAL_MS = _num("DISCOVERY_INTERVAL_MS", "DISCOVERY_INTERVAL_MS", 30 * 60 * 1000);

/** Max number of protocol discovery scans to run concurrently */
export const DISCOVERY_PROTOCOL_CONCURRENCY = _num(
  "DISCOVERY_PROTOCOL_CONCURRENCY",
  "DISCOVERY_PROTOCOL_CONCURRENCY",
  3,
);

// ─── RPC ───────────────────────────────────────────────────────

function _dedupeRpcUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of urls) {
    const url = String(raw || "").trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

// Parse POLYGON_RPC_URLS once; used both as POLYGON_RPC fallback and pool seed.
const _envRpcUrls = _dedupeRpcUrls(
  (process.env.POLYGON_RPC_URLS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);

/**
 * Primary RPC used for execution (sendTx, nonce, gas estimates) and any call
 * that needs a single authoritative endpoint.
 *
 * Priority: POLYGON_RPC env → first POLYGON_RPC_URLS entry → Alchemy demo
 *           (rate-limited, for dev only).
 */
export const POLYGON_RPC =
  process.env.POLYGON_RPC ||
  _envRpcUrls[0] ||
  "https://polygon-mainnet.g.alchemy.com/v2/demo";

/**
 * Pool of Polygon RPC endpoints managed by the latency-based RPC manager.
 *
 * Priority order (highest first):
 *   1. POLYGON_RPC      — paid/private endpoint if explicitly configured
 *   2. POLYGON_RPC_URLS — comma-separated env override
 *   3. Built-in free public endpoints (fallback)
 *
 * The manager probes all endpoints every 15 s and routes to the healthiest one.
 */
const _defaultFreeRpcs = [
  "https://poly.api.pocket.network",        // Pocket Network
  "https://polygon-bor-rpc.publicnode.com", // PublicNode
  "https://polygon-rpc.com",                // Official Polygon public RPC
  "https://rpc.ankr.com/polygon",           // Ankr public
  "https://polygon.llamarpc.com",           // LlamaNodes public
  "https://polygon-public.nodies.app",      // Nodies
  "https://polygon.api.onfinality.io/public", // OnFinality
  "https://tenderly.rpc.polygon.community", // Tenderly community RPC
];

const _paidRpc =
  process.env.POLYGON_RPC && !process.env.POLYGON_RPC.includes("/v2/demo")
    ? [process.env.POLYGON_RPC]
    : [];

const _publicRpcUrls = _envRpcUrls.length ? _envRpcUrls : _defaultFreeRpcs;

const _allUrls = [
  ..._paidRpc,
  ..._publicRpcUrls,
];

export const FREE_RPC_URLS = [...new Set(_allUrls)];

// ─── Private Mempool ───────────────────────────────────────────

/**
 * URL of the private mempool endpoint.
 *   Alchemy:  https://polygon-mainnet.g.alchemy.com/v2/<KEY>
 *   Custom:   any endpoint accepting eth_sendRawTransaction
 */
export const PRIVATE_MEMPOOL_URL = process.env.PRIVATE_MEMPOOL_URL || "";

/**
 * RPC method to use with PRIVATE_MEMPOOL_URL.
 *   "eth_sendPrivateTransaction" — Alchemy / QuickNode private tx
 *   "eth_sendBundle"             — bundle-capable private relay
 *   "eth_sendRawTransaction"     — standard submission (default if unset)
 */
export const PRIVATE_MEMPOOL_METHOD =
  process.env.PRIVATE_MEMPOOL_METHOD || "eth_sendRawTransaction";

/**
 * Dedicated Polygon private mempool endpoint. Keep this separate from the
 * generic PRIVATE_MEMPOOL_URL so provider-specific rollout does not affect
 * other private relay paths.
 */
export const POLYGON_PRIVATE_MEMPOOL_URL =
  process.env.POLYGON_PRIVATE_MEMPOOL_URL || "";

/**
 * RPC method used by the Polygon private mempool endpoint. Default assumes
 * a drop-in eth_sendRawTransaction-style interface.
 */
export const POLYGON_PRIVATE_MEMPOOL_METHOD =
  process.env.POLYGON_PRIVATE_MEMPOOL_METHOD || "eth_sendRawTransaction";

/**
 * Optional auth header for Polygon private mempool access. Example:
 *   "Authorization"
 *   "x-api-key"
 */
export const POLYGON_PRIVATE_MEMPOOL_AUTH_HEADER =
  process.env.POLYGON_PRIVATE_MEMPOOL_AUTH_HEADER || "";

/**
 * Optional auth token/value paired with POLYGON_PRIVATE_MEMPOOL_AUTH_HEADER.
 */
export const POLYGON_PRIVATE_MEMPOOL_AUTH_TOKEN =
  process.env.POLYGON_PRIVATE_MEMPOOL_AUTH_TOKEN || "";

// ─── RPC Retry / Rate-Limit ───────────────────────────────────

/** Max retry attempts for a single RPC call on 429/5xx */
export const RPC_MAX_RETRIES = 5;

/** Base delay before first retry (ms); doubles each attempt */
export const RPC_BASE_DELAY_MS = 500;

/** Ceiling for backoff delay (ms) */
export const RPC_MAX_DELAY_MS = 30_000;

// ─── Concurrency (auto-tuned) ─────────────────────────────────

/**
 * Max concurrent RPC enrichment calls (Balancer getPoolTokens, Curve get_coins).
 * Auto-tuned from RPC latency; higher = faster enrichment but more rate-limit risk.
 */
export const ENRICH_CONCURRENCY = _num("ENRICH_CONCURRENCY", "ENRICH_CONCURRENCY", 6);

/**
 * Max concurrent getReserves() calls during V2 state polling.
 * Higher than ENRICH_CONCURRENCY because V2 calls are cheaper.
 */
export const V2_POLL_CONCURRENCY = _num("V2_POLL_CONCURRENCY", "V2_POLL_CONCURRENCY", 10);

/**
 * Max concurrent slot0 / liquidity calls during V3 state polling.
 */
export const V3_POLL_CONCURRENCY = _num("V3_POLL_CONCURRENCY", "V3_POLL_CONCURRENCY", 3);

// ─── Worker threads (auto-tuned) ─────────────────────────────

/**
 * Number of persistent worker threads in the simulation pool.
 * Default: (CPU cores − 1), leaving one core for the main thread.
 */
export const WORKER_COUNT = _num(
  "WORKER_COUNT",
  "WORKER_COUNT",
  Math.max(1, os.cpus().length - 1)
);

/**
 * Minimum path count before offloading to worker threads.
 * Below this threshold, IPC serialisation overhead exceeds the benefit.
 */
export const EVAL_WORKER_THRESHOLD = _num("EVAL_WORKER_THRESHOLD", "EVAL_WORKER_THRESHOLD", 100);

// ─── Routing / cycle enumeration (auto-tuned) ────────────────

/**
 * Hard cap on the number of candidate arbitrage paths kept in memory.
 * Auto-tuned from available heap.
 */
export const MAX_TOTAL_PATHS = _num("MAX_TOTAL_PATHS", "MAX_TOTAL_PATHS", 20_000);

/**
 * How many of the top simulation candidates to run ternary-search optimisation on.
 * Auto-tuned from math throughput to stay within ~100ms.
 */
export const MAX_PATHS_TO_OPTIMIZE = _num("MAX_PATHS_TO_OPTIMIZE", "MAX_PATHS_TO_OPTIMIZE", 15);

/**
 * Maximum number of hub-pair pools to fetch synchronously during startup warmup.
 * Remaining pools are deferred to watcher-driven admission to bound cold-start latency.
 */
export const MAX_SYNC_WARMUP_POOLS = _num(
  "MAX_SYNC_WARMUP_POOLS",
  "MAX_SYNC_WARMUP_POOLS",
  400
);

/**
 * Maximum number of V3 pools to fully hydrate during synchronous startup warmup.
 * Additional selected V3 pools still warm up, but fall back to nearby-word
 * hydration instead of being deferred out of the sync warmup set.
 */
export const MAX_SYNC_WARMUP_V3_POOLS = _num(
  "MAX_SYNC_WARMUP_V3_POOLS",
  "MAX_SYNC_WARMUP_V3_POOLS",
  Math.min(96, Math.max(32, Math.floor(MAX_SYNC_WARMUP_POOLS * 0.2)))
);

/**
 * Secondary startup warmup budget for pools that touch at least one hub token.
 * This widens token coverage while still capping cold-start latency.
 */
export const MAX_SYNC_WARMUP_ONE_HUB_POOLS = _num(
  "MAX_SYNC_WARMUP_ONE_HUB_POOLS",
  "MAX_SYNC_WARMUP_ONE_HUB_POOLS",
  160
);

/**
 * Number of bitmap words on each side of the active tick to hydrate for
 * staged V3 admission when full tick hydration would be too expensive.
 */
export const V3_NEARBY_WORD_RADIUS = _num(
  "V3_NEARBY_WORD_RADIUS",
  "V3_NEARBY_WORD_RADIUS",
  2
);

/**
 * Background sweeper budget for active pools that still lack routable state
 * after startup and have not emitted watcher events yet.
 */
export const QUIET_POOL_SWEEP_BATCH_SIZE = _num(
  "QUIET_POOL_SWEEP_BATCH_SIZE",
  "QUIET_POOL_SWEEP_BATCH_SIZE",
  24
);

/** Minimum delay between quiet-pool sweep passes (ms). */
export const QUIET_POOL_SWEEP_INTERVAL_MS = _num(
  "QUIET_POOL_SWEEP_INTERVAL_MS",
  "QUIET_POOL_SWEEP_INTERVAL_MS",
  60_000
);

/** Maximum number of V3-family pools to hydrate in one legacy poller pass. */
export const V3_POLL_MAX_POOLS = _num(
  "V3_POLL_MAX_POOLS",
  "V3_POLL_MAX_POOLS",
  750
);

/** Max age of per-pool state allowed for execution-triggered route revalidation (ms). */
export const ROUTE_STATE_MAX_AGE_MS = _num(
  "ROUTE_STATE_MAX_AGE_MS",
  "ROUTE_STATE_MAX_AGE_MS",
  10_000
);

/** Max timestamp skew allowed across pools in one route before execution (ms). */
export const ROUTE_STATE_MAX_SKEW_MS = _num(
  "ROUTE_STATE_MAX_SKEW_MS",
  "ROUTE_STATE_MAX_SKEW_MS",
  3_000
);

/**
 * How often to rebuild the full cycle cache (ms).
 * The HyperSync watcher keeps state fresh; this only needs to run when
 * new pools are discovered.  Default: 2 minutes (was 10 minutes).
 */
export const CYCLE_REFRESH_INTERVAL_MS = _num(
  "CYCLE_REFRESH_INTERVAL_MS",
  "CYCLE_REFRESH_INTERVAL_MS",
  2 * 60 * 1000
);

/** Number of high-liquidity extra start tokens to include in selective 4-hop enumeration. */
export const SELECTIVE_4HOP_TOKEN_LIMIT = _num(
  "SELECTIVE_4HOP_TOKEN_LIMIT",
  "SELECTIVE_4HOP_TOKEN_LIMIT",
  6
);

/** Path budget reserved for selective 4-hop exploration beyond the core hub graph. */
export const SELECTIVE_4HOP_PATH_BUDGET = _num(
  "SELECTIVE_4HOP_PATH_BUDGET",
  "SELECTIVE_4HOP_PATH_BUDGET",
  Math.max(800, Math.floor(MAX_TOTAL_PATHS * 0.2))
);

/** Max selective 4-hop paths kept per token. */
export const SELECTIVE_4HOP_MAX_PATHS_PER_TOKEN = _num(
  "SELECTIVE_4HOP_MAX_PATHS_PER_TOKEN",
  "SELECTIVE_4HOP_MAX_PATHS_PER_TOKEN",
  1_500
);

/** Optional env-driven hub-token extensions. */
export const EXTRA_POLYGON_HUB_TOKENS = _addressList("EXTRA_POLYGON_HUB_TOKENS");
export const EXTRA_HUB_4_TOKENS = _addressList("EXTRA_HUB_4_TOKENS");

// ─── Runtime ───────────────────────────────────────────────────

/** Default poll interval for legacy polling (sec) */
export const DEFAULT_POLL_INTERVAL_SEC = _num("DEFAULT_POLL_INTERVAL_SEC", "DEFAULT_POLL_INTERVAL_SEC", 30);

/** Max consecutive errors before giving up on a run pass */
export const MAX_CONSECUTIVE_ERRORS = _num("MAX_CONSECUTIVE_ERRORS", "MAX_CONSECUTIVE_ERRORS", 5);

// ─── Gas oracle (auto-tuned) ─────────────────────────────────

/**
 * How often the background Gas Oracle polls for new fee data (ms).
 * Auto-tuned from RPC latency.  Faster networks can afford more frequent polls.
 */
export const GAS_POLL_INTERVAL_MS = _num("GAS_POLL_INTERVAL_MS", "GAS_POLL_INTERVAL_MS", 5_000);
