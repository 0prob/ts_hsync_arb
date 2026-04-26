
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
// Imported lazily to avoid circular dependency (metrics → logger → metrics).
type RpcMetricHandles = {
  rpcErrors?: any;
  rpcSwitches?: any;
  rpcLatencyMs?: any;
};

let _rpcMetrics: RpcMetricHandles | null = null;
let _rpcMetricsPromise: Promise<RpcMetricHandles | null> | null = null;

async function lazyMetrics() {
  if (_rpcMetrics) return _rpcMetrics;
  if (_rpcMetricsPromise) return _rpcMetricsPromise;

  _rpcMetricsPromise = import("./metrics.ts")
    .then((m) => {
      _rpcMetrics = {
        rpcErrors: m.rpcErrors,
        rpcSwitches: m.rpcSwitches,
        rpcLatencyMs: m.rpcLatencyMs,
      };
      return _rpcMetrics;
    })
    .catch(() => null)
    .finally(() => {
      _rpcMetricsPromise = null;
    });

  return _rpcMetricsPromise;
}

function recordRpcSwitch(reason: string) {
  void lazyMetrics().then((metrics) => {
    metrics?.rpcSwitches?.labels(reason).inc();
  });
}

function recordRpcError(method: string) {
  void lazyMetrics().then((metrics) => {
    metrics?.rpcErrors?.labels(method).inc();
  });
}

function observeRpcLatency(endpoint: string, latencyMs: number) {
  void lazyMetrics().then((metrics) => {
    metrics?.rpcLatencyMs?.labels(endpoint).observe(latencyMs);
  });
}

// ─── RpcEndpoint ───────────────────────────────────────────────

const PROBE_TIMEOUT_MS = 1_000;
const INITIAL_BACKOFF_MS = 30_000;  // 30 s after first 429
const MAX_BACKOFF_MS = 300_000;     // 5 min ceiling
const ERROR_COOLDOWN_BASE_MS = 5_000;
const ERROR_COOLDOWN_MAX_MS = 60_000;
const METHOD_UNAVAILABLE_COOLDOWN_MS = 86_400_000; // 24 h
const IN_FLIGHT_LATENCY_PENALTY_MS = 250;

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
      {
        event: "rpc_endpoint_backoff",
        endpoint: rpcManagerShortUrl(this.url),
        reason,
        cooldown_s: Math.max(1, Math.round(cooldownMs / 1000)),
      },
      "RPC endpoint entered cooldown"
    );
    if (!methodUnavailable) {
      this._backoffMs = Math.min(this._backoffMs * 2, MAX_BACKOFF_MS);
    }
    recordRpcSwitch(methodUnavailable ? "unsupported_method" : "rate_limited");
    recordRpcError("unknown");
  }

  /**
   * Record a successful call — resets error state and backoff.
   */
  markSuccess() {
    this.consecutiveErrors = 0;
    this.rateLimitedUntil = 0;
    this.errorCooldownUntil = 0;
    this._backoffMs = INITIAL_BACKOFF_MS;
  }

  /**
   * Record a non-rate-limit error (network, timeout, 5xx).
   */
  markError(options: { extendActiveCooldown?: boolean } = {}) {
    const extendActiveCooldown = options.extendActiveCooldown ?? true;
    if (!extendActiveCooldown && this.isCoolingDown()) {
      this.latencyMs = Infinity;
      return;
    }

    this.consecutiveErrors++;
    this.latencyMs = Infinity;
    const cooldownMs = Math.min(
      ERROR_COOLDOWN_BASE_MS * Math.pow(2, Math.max(0, this.consecutiveErrors - 1)),
      ERROR_COOLDOWN_MAX_MS
    );
    this.errorCooldownUntil = Date.now() + cooldownMs;
    recordRpcSwitch("error");
    recordRpcError("unknown");
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
      observeRpcLatency(rpcManagerShortUrl(this.url), this.latencyMs);
      // A cheap block-number probe should not erase an active contract-read
      // cooldown window; let a real successful request restore trust instead.
      if (!this.isRateLimited() && !this.isCoolingDown()) {
        this.markSuccess();
      }
    } catch {
      this.markError({ extendActiveCooldown: false });
    }
  }
}

// ─── RpcManager ────────────────────────────────────────────────

class RpcManager {
  endpoints: RpcEndpoint[];
  _probeInterval: ReturnType<typeof setInterval> | null;
  _probePromise: Promise<void> | null;
  _nextIndex: number;

  constructor(urls: string[]) {
    if (!urls || urls.length === 0) {
      throw new Error("RpcManager: at least one RPC URL required");
    }
    this.endpoints = urls.map((u) => new RpcEndpoint(u));
    this._probeInterval = null;
    this._probePromise = null;
    this._nextIndex = 0;
  }

  /**
   * Return the healthiest endpoint:
   *   1. Non-rate-limited, non-cooling endpoints sorted by latency plus a
   *      small in-flight load penalty
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
      return this._selectEndpoint(
        healthy,
        (ep) => this._endpointLoadScore(ep)
      );
    }

    // All healthy candidates exhausted — pick the non-rate-limited endpoint
    // whose transport-error cooldown expires soonest.
    const available = this.endpoints.filter((ep) => !ep.isRateLimited());
    if (available.length > 0) {
      return this._selectEndpoint(
        available,
        (ep) => [ep.errorCooldownUntil, ep.inFlight, ep.latencyMs]
      );
    }

    // All rate-limited — return the one whose cooldown expires soonest
    return this._selectEndpoint(
      this.endpoints,
      (ep) => [ep.rateLimitedUntil, ep.inFlight, ep.latencyMs]
    );
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
    if (this._probePromise) return this._probePromise;

    this._probePromise = (async () => {
      try {
        await Promise.allSettled(this.endpoints.map((ep) => ep.probe()));
        this._logRanking();
      } finally {
        this._probePromise = null;
      }
    })();

    return this._probePromise;
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

    logger.debug(
      {
        event: "rpc_endpoint_ranking",
        ranking: lines,
      },
      "RPC endpoint ranking updated"
    );
  }

  _selectEndpoint(
    candidates: RpcEndpoint[],
    scoreFn: (ep: RpcEndpoint) => number[]
  ) {
    let bestScore: number[] | null = null;
    let tied: RpcEndpoint[] = [];

    for (const ep of candidates) {
      const score = scoreFn(ep);
      if (bestScore === null) {
        bestScore = score;
        tied = [ep];
        continue;
      }
      const cmp = this._compareScores(score, bestScore);
      if (cmp < 0) {
        bestScore = score;
        tied = [ep];
      } else if (cmp === 0) {
        tied.push(ep);
      }
    }

    const chosen = this._roundRobinTieBreak(tied);
    const chosenIndex = this.endpoints.indexOf(chosen);
    if (chosenIndex >= 0) {
      this._nextIndex = (chosenIndex + 1) % this.endpoints.length;
    }
    return chosen;
  }

  _compareScores(a: number[], b: number[]) {
    const len = Math.max(a.length, b.length);
    for (let i = 0; i < len; i++) {
      const av = a[i] ?? 0;
      const bv = b[i] ?? 0;
      if (av !== bv) return av < bv ? -1 : 1;
    }
    return 0;
  }

  _roundRobinTieBreak(candidates: RpcEndpoint[]) {
    if (candidates.length === 1) return candidates[0];
    for (let offset = 0; offset < this.endpoints.length; offset++) {
      const idx = (this._nextIndex + offset) % this.endpoints.length;
      const ep = this.endpoints[idx];
      if (candidates.includes(ep)) return ep;
    }
    return candidates[0];
  }

  _endpointLoadScore(ep: RpcEndpoint) {
    const hasLatency = Number.isFinite(ep.latencyMs);
    const effectiveLatency = hasLatency
      ? ep.latencyMs + ep.inFlight * IN_FLIGHT_LATENCY_PENALTY_MS
      : Infinity;
    return [
      hasLatency ? 0 : 1,
      effectiveLatency,
      ep.inFlight,
    ];
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
      if (typeof value !== "function") return value;
      return async (...args: unknown[]) => {
        const endpoint = rpcManager.checkoutBestEndpoint();
        const boundClient = endpoint.client as Record<string | symbol, unknown>;
        const method = boundClient[prop];

        try {
          const result = await (method as (...callArgs: unknown[]) => unknown).apply(boundClient, args);
          rpcManager.markSuccess(endpoint.url);
          return result;
        } catch (error) {
          if (isRateLimitError(error) || isEndpointCapabilityError(error)) {
            rpcManager.markRateLimited(endpoint.url, error);
          } else if (isRetryableError(error)) {
            rpcManager.markError(endpoint.url);
          }
          throw error;
        } finally {
          rpcManager.releaseEndpoint(endpoint.url);
        }
      };
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
  const lower = msg.toLowerCase();
  if (/\b5\d{2}\b/.test(msg)) return true;
  // viem HttpRequestError: endpoint returned a non-JSON or malformed response
  if (msg.includes("HTTP request failed")) return true;
  if (
    lower.includes("fetch failed") ||
    lower.includes("socket hang up") ||
    lower.includes("econnreset") ||
    lower.includes("etimedout") ||
    lower.includes("timeout") ||
    lower.includes("timed out") ||
    lower.includes("temporary failure") ||
    lower.includes("network error")
  ) {
    return true;
  }
  return false;
}

function _isMethodUnavailableError(error: unknown): boolean {
  return isEndpointCapabilityError(error);
}
