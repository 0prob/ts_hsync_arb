
/**
 * src/utils/rpc_manager.js — Multi-RPC manager with latency-based switching
 *
 * Manages a pool of free Polygon RPC endpoints and automatically routes
 * requests to the lowest-latency, non-rate-limited endpoint.
 *
 * Features:
 *   - Background latency probing (eth_blockNumber every 15s)
 *   - Automatic rate-limit detection and exponential backoff per endpoint
 *   - getBestEndpoint(): always returns the healthiest available endpoint
 *   - Dynamic proxy publicClient that delegates to the best endpoint
 */

import { createPublicClient, http } from "viem";
import { polygon } from "viem/chains";
import { logger } from "./logger.ts";
import { FREE_RPC_URLS } from "../config/index.ts";

// ─── Metrics ───────────────────────────────────────────────────
// Imported lazily to avoid circular dependency (metrics → logger → nothing)
import type { Counter, Histogram } from "prom-client";
let _rpcSwitches: Counter | null = null;
let _rpcLatency: Histogram | null = null;
async function lazyMetrics() {
  if (_rpcSwitches) return;
  try {
    const m = await import("./metrics.ts");
    _rpcSwitches = m.rpcSwitches ?? null;
    _rpcLatency = m.rpcLatencyMs ?? null;
  } catch {
    // metrics module may not expose these gauges yet; safe to skip
  }
}

// ─── RpcEndpoint ───────────────────────────────────────────────

const PROBE_TIMEOUT_MS = 1_000;
const INITIAL_BACKOFF_MS = 30_000;  // 30 s after first 429
const MAX_BACKOFF_MS = 300_000;     // 5 min ceiling
const ERROR_COOLDOWN_BASE_MS = 5_000;
const ERROR_COOLDOWN_MAX_MS = 60_000;
const METHOD_UNAVAILABLE_COOLDOWN_MS = 86_400_000; // 24 h

class RpcEndpoint {
  url: string;
  latencyMs: number;
  consecutiveErrors: number;
  rateLimitedUntil: number;
  errorCooldownUntil: number;
  inFlight: number;
  _backoffMs: number;
  client: ReturnType<typeof createPublicClient>;

  constructor(url: string) {
    this.url = url;
    this.latencyMs = Infinity;     // updated by probe()
    this.consecutiveErrors = 0;
    this.rateLimitedUntil = 0;     // epoch ms
    this.errorCooldownUntil = 0;   // epoch ms for transport/5xx failures
    this.inFlight = 0;             // active retry-managed requests pinned here
    this._backoffMs = INITIAL_BACKOFF_MS;

    this.client = createPublicClient({
      chain: polygon,
      transport: http(url, {
        timeout: 10_000,
        fetchOptions: { headers: { Connection: "keep-alive" } },
      }),
    });
  }

  /** True while the endpoint is in its rate-limit cooldown window. */
  isRateLimited() {
    return Date.now() < this.rateLimitedUntil;
  }

  /** True while the endpoint is cooling down after recent retryable errors. */
  isCoolingDown() {
    return Date.now() < this.errorCooldownUntil;
  }

  /**
   * Record a 429 / rate-limit event. Applies exponential backoff and logs it.
   */
  markRateLimited(error: unknown = null) {
    const methodUnavailable = _isMethodUnavailableError(error);
    const cooldownMs = methodUnavailable
        ? METHOD_UNAVAILABLE_COOLDOWN_MS
      : this._backoffMs;

    this.rateLimitedUntil = Date.now() + cooldownMs;
    const reason = methodUnavailable
      ? "unsupported for contract reads"
      : "rate-limited";
    logger.warn(
      `[rpc_manager] ${rpcManagerShortUrl(this.url)} ${reason} — ` +
        `cooldown ${Math.max(1, Math.round(cooldownMs / 1000))}s`
    );
    if (!methodUnavailable) {
      this._backoffMs = Math.min(this._backoffMs * 2, MAX_BACKOFF_MS);
    }
    lazyMetrics();
  }

  /**
   * Record a successful call — resets error state and backoff.
   */
  markSuccess() {
    this.consecutiveErrors = 0;
    this.errorCooldownUntil = 0;
    this._backoffMs = INITIAL_BACKOFF_MS;
  }

  /**
   * Record a non-rate-limit error (network, timeout, 5xx).
   */
  markError() {
    this.consecutiveErrors++;
    this.latencyMs = Infinity;
    const cooldownMs = Math.min(
      ERROR_COOLDOWN_BASE_MS * Math.pow(2, Math.max(0, this.consecutiveErrors - 1)),
      ERROR_COOLDOWN_MAX_MS
    );
    this.errorCooldownUntil = Date.now() + cooldownMs;
  }

  /**
   * Probe latency by calling eth_blockNumber with a hard timeout.
   * Updates this.latencyMs on success, sets Infinity on failure.
   */
  async probe() {
    const start = Date.now();
    try {
      const raceResult = await Promise.race([
        this.client.getBlockNumber(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("probe timeout")), PROBE_TIMEOUT_MS)
        ),
      ]);
      void raceResult; // discard value; we only care about latency
      this.latencyMs = Date.now() - start;
      // A cheap block-number probe should not erase an active contract-read
      // cooldown window; let a real successful request restore trust instead.
      if (!this.isRateLimited() && !this.isCoolingDown()) {
        this.markSuccess();
      }
    } catch {
      this.latencyMs = Infinity;
      this.consecutiveErrors++;
    }
  }
}

// ─── RpcManager ────────────────────────────────────────────────

class RpcManager {
  endpoints: RpcEndpoint[];
  _probeInterval: ReturnType<typeof setInterval> | null;

  constructor(urls: string[]) {
    if (!urls || urls.length === 0) {
      throw new Error("RpcManager: at least one RPC URL required");
    }
    this.endpoints = urls.map((u) => new RpcEndpoint(u));
    this._probeInterval = null;
  }

  /**
   * Return the healthiest endpoint:
   *   1. Non-rate-limited, non-cooling endpoints sorted by ascending latency
   *   2. If all healthy candidates are cooling down, pick the one whose
   *      transport-error cooldown expires soonest
   *   3. If ALL are rate-limited, pick the one whose cooldown expires soonest
   *
   * Endpoints with >= MAX_CONSECUTIVE_ERRORS are treated as temporarily
   * unavailable to prevent the gas oracle getting stuck on an endpoint that
   * passes the probe (eth_blockNumber) but fails on other calls (e.g. an
   * endpoint that returns invalid JSON for eth_getBlockByNumber).
   */
  getBestEndpoint() {
    const healthy = this.endpoints.filter(
      (ep) => !ep.isRateLimited() && !ep.isCoolingDown()
    );

    if (healthy.length > 0) {
      return healthy.reduce((best, ep) => {
        if (ep.inFlight !== best.inFlight) {
          return ep.inFlight < best.inFlight ? ep : best;
        }
        return ep.latencyMs < best.latencyMs ? ep : best;
      });
    }

    // All healthy candidates exhausted — pick the non-rate-limited endpoint
    // whose transport-error cooldown expires soonest.
    const available = this.endpoints.filter((ep) => !ep.isRateLimited());
    if (available.length > 0) {
      return available.reduce((best, ep) => {
        if (ep.errorCooldownUntil !== best.errorCooldownUntil) {
          return ep.errorCooldownUntil < best.errorCooldownUntil ? ep : best;
        }
        if (ep.inFlight !== best.inFlight) {
          return ep.inFlight < best.inFlight ? ep : best;
        }
        return ep.latencyMs < best.latencyMs ? ep : best;
      });
    }

    // All rate-limited — return the one whose cooldown expires soonest
    return this.endpoints.reduce((best, ep) => {
      if (ep.rateLimitedUntil !== best.rateLimitedUntil) {
        return ep.rateLimitedUntil < best.rateLimitedUntil ? ep : best;
      }
      if (ep.inFlight !== best.inFlight) {
        return ep.inFlight < best.inFlight ? ep : best;
      }
      return ep.latencyMs < best.latencyMs ? ep : best;
    });
  }

  /** Convenience: return the viem PublicClient for the best endpoint. */
  getBestClient() {
    return this.getBestEndpoint().client;
  }

  /**
   * Returns the milliseconds until at least one endpoint is fully healthy
   * (neither rate-limited nor in error cooldown). Returns 0 if any endpoint
   * is already healthy — callers can skip the wait in that case.
   */
  msUntilAnyEndpointAvailable() {
    const now = Date.now();
    if (this.endpoints.some((ep) => !ep.isRateLimited() && !ep.isCoolingDown())) return 0;
    const soonest = this.endpoints.reduce((min, ep) => {
      const avail = Math.max(ep.rateLimitedUntil, ep.errorCooldownUntil);
      return Math.min(min, avail);
    }, Infinity);
    return Number.isFinite(soonest) ? Math.max(0, soonest - now) : 0;
  }

  /**
   * Reserve the current best endpoint for the lifetime of one retry-managed call.
   * This reduces herd behavior where many concurrent requests pick the same
   * low-latency endpoint before the first 429 updates its cooldown state.
   */
  checkoutBestEndpoint() {
    const ep = this.getBestEndpoint();
    ep.inFlight++;
    return ep;
  }

  /**
   * Find an endpoint by URL and mark it as rate-limited.
   * @param {string} url
   */
  markRateLimited(url: string, error: unknown = null) {
    const ep = this.endpoints.find((e) => e.url === url);
    if (ep) ep.markRateLimited(error);
  }

  /**
   * Find an endpoint by URL and mark a non-RL error.
   * @param {string} url
   */
  markError(url: string) {
    const ep = this.endpoints.find((e) => e.url === url);
    if (ep) ep.markError();
  }

  /**
   * Find an endpoint by URL and record a success.
   * @param {string} url
   */
  markSuccess(url: string) {
    const ep = this.endpoints.find((e) => e.url === url);
    if (ep) ep.markSuccess();
  }

  /**
   * Release a prior checkoutBestEndpoint() reservation.
   * @param {string} url
   */
  releaseEndpoint(url: string) {
    const ep = this.endpoints.find((e) => e.url === url);
    if (ep) {
      ep.inFlight = Math.max(0, ep.inFlight - 1);
    }
  }

  /**
   * Probe all endpoints concurrently and log the ranked results.
   */
  async probe() {
    await Promise.allSettled(this.endpoints.map((ep) => ep.probe()));
    this._logRanking();
  }

  /** Start background probing at the given interval (default 15 s). */
  start(intervalMs = 15_000) {
    if (this._probeInterval) return;
    // Initial probe (fire-and-forget)
    this.probe().catch(() => {});
    this._probeInterval = setInterval(() => this.probe().catch(() => {}), intervalMs);
    if (this._probeInterval.unref) this._probeInterval.unref(); // don't block process exit
  }

  /** Stop background probing. */
  stop() {
    if (this._probeInterval) {
      clearInterval(this._probeInterval);
      this._probeInterval = null;
    }
  }

  // ─── Private ─────────────────────────────────────────────────

  _logRanking() {
    const ranked = [...this.endpoints].sort((a, b) => {
      if (a.isRateLimited() !== b.isRateLimited())
        return a.isRateLimited() ? 1 : -1;
      return a.latencyMs - b.latencyMs;
    });

    const lines = ranked
      .map((ep, i) => {
        const ms =
          ep.latencyMs === Infinity ? "  ∞" : String(ep.latencyMs).padStart(4);
        const rl = ep.isRateLimited() ? " [RL]" : "";
        const cd = ep.isCoolingDown() ? " [ERR]" : "";
        const load = ep.inFlight > 0 ? ` [IN=${ep.inFlight}]` : "";
        return `  ${i + 1}. ${rpcManagerShortUrl(ep.url)}  ${ms}ms${rl}${cd}${load}`;
      })
      .join("\n");

    logger.debug(`[rpc_manager] Endpoint ranking:\n${lines}`);
  }
}

// ─── Helpers ───────────────────────────────────────────────────

function rpcManagerShortUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname + (u.pathname !== "/" ? u.pathname.slice(0, 20) : "");
  } catch {
    return url.slice(0, 40);
  }
}

// ─── Singleton ─────────────────────────────────────────────────

export const rpcManager = new RpcManager(FREE_RPC_URLS);

// Start background probing unless we're in test mode
if (process.env.NODE_ENV !== "test") {
  rpcManager.start();
}

// ─── Dynamic proxy publicClient ────────────────────────────────
// Every property access is forwarded to the best available endpoint's
// viem client, so callers can treat this as a normal PublicClient.

export const dynamicPublicClient = new Proxy(
  {},
  {
    get(_target, prop) {
      const client = rpcManager.getBestClient() as Record<string | symbol, unknown>;
      const value = client[prop];
      // Bind methods to their original client so `this` works correctly
      return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(client) : value;
    },
  }
);

// ─── isRateLimitError ──────────────────────────────────────────

/**
 * Returns true if an error indicates a 429 / rate-limit condition.
 * @param {unknown} error
 */
export function isRateLimitError(error: unknown): boolean {
  const msg = String((error as { message?: string })?.message ?? error ?? "");
  const lower = msg.toLowerCase();
  return (
    msg.includes("429") ||
    lower.includes("too many requests") ||
    lower.includes("exceeded the quota usage") ||
    lower.includes("quota usage") ||
    lower.includes("-32001")
  );
}

/**
 * Returns true if an endpoint rejects a JSON-RPC method due to plan or policy.
 * These are endpoint capability failures, so callers should fail over.
 * @param {unknown} error
 */
export function isEndpointCapabilityError(error: unknown): boolean {
  const lower = String((error as { message?: string })?.message ?? error ?? "").toLowerCase();
  return (
    lower.includes("paid plans only") ||
    lower.includes("upgrade your subscription") ||
    lower.includes("method 'eth_call' is available for paid plans only") ||
    lower.includes('method "eth_call" is available for paid plans only') ||
    lower.includes("method not available") ||
    lower.includes("unsupported method") ||
    lower.includes("batch to blocks") ||
    lower.includes("cast type of column 'number'") ||
    lower.includes('cast type of column "number"')
  );
}

/**
 * Returns true if an error is retryable (429, 5xx, network, malformed response).
 * @param {unknown} error
 */
export function isRetryableError(error: unknown): boolean {
  if (isRateLimitError(error)) return true;
  if (isEndpointCapabilityError(error)) return true;
  const msg = String((error as { message?: string })?.message ?? error ?? "");
  if (/\b5\d{2}\b/.test(msg)) return true;
  // viem HttpRequestError: endpoint returned a non-JSON or malformed response
  if (msg.includes("HTTP request failed")) return true;
  return false;
}

function _isMethodUnavailableError(error: unknown): boolean {
  return isEndpointCapabilityError(error);
}
