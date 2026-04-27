
/**
 * src/enrichment/rpc.js — Shared viem public client with multi-RPC switching
 *
 * Provides:
 *   - publicClient: dynamic proxy that always routes to the best RPC endpoint
 *   - executeWithRpcRetry(): generic wrapper with per-endpoint switching
 *   - readContractWithRetry(): readContract wrapper with per-endpoint switching
 *   - throttledMap(): concurrency-limited async mapper for batch enrichment
 */

import {
  rpcManager,
  dynamicPublicClient,
  isEndpointCapabilityError,
  isRateLimitError,
  isRetryableError,
} from "../utils/rpc_manager.ts";
import {
  RPC_MAX_RETRIES,
  RPC_BASE_DELAY_MS,
  RPC_MAX_DELAY_MS,
  POLYGON_RPC,
} from "../config/index.ts";

// ─── Warn about demo endpoint ──────────────────────────────────

if (process.env.NODE_ENV !== "test" && POLYGON_RPC.includes("/v2/demo")) {
  console.warn(
    "WARNING: Using Alchemy demo RPC endpoint — rate limits are extremely low.\n" +
      "         Set POLYGON_RPC in .env to a real endpoint for production use."
  );
}

// ─── Public client ─────────────────────────────────────────────
// Re-export the dynamic proxy so existing callers don't need changes.

export const publicClient = dynamicPublicClient;

// ─── Retry helpers ─────────────────────────────────────────────

export async function executeWithRpcRetry(fn: any, options: any = {}) {
  const {
    retries = RPC_MAX_RETRIES,
    method = "unknown",
    onRateLimitMessage = null,
    onRetryMessage = null,
  } = options;

  let lastError;
  const capabilityFailedUrls = new Set<string>();
  const maxAttempts = Math.max(1, rpcManager.endpoints.length + retries);
  const rpcMethod = String(method || "unknown");

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (rpcManager.areAllEndpointsMethodUnavailable(rpcMethod)) {
      throw new Error(
        `RPC method unsupported by all configured endpoints (${rpcManager.endpoints.length}) for ${rpcMethod}`
      );
    }

    // If every endpoint is currently rate-limited or cooling down, wait for
    // the soonest one to recover before issuing the call. Without this, we
    // burn all retry slots instantly on rapid-fire 429s and then throw even
    // though a healthy endpoint would be available in a few seconds, or wake
    // early and keep extending endpoint cooldowns under concurrent warmup.
    const waitMs = rpcManager.msUntilAnyEndpointAvailable(rpcMethod);
    if (waitMs > 0) {
      const jitterMs = Math.floor(Math.random() * 250);
      await new Promise((resolve) => setTimeout(resolve, waitMs + 50 + jitterMs));
    }

    const endpoint = rpcManager.checkoutBestEndpoint(rpcMethod);
    const client = endpoint.client;

    try {
      const result = await fn(client, endpoint, attempt);
      rpcManager.markSuccess(endpoint.url);
      return result;
    } catch (error) {
      lastError = error;

      if (isEndpointCapabilityError(error)) {
        capabilityFailedUrls.add(endpoint.url);
        rpcManager.markMethodUnavailable(endpoint.url, rpcMethod);
        if (attempt === 0 && onRateLimitMessage) {
          console.warn(
            onRateLimitMessage(rpcShortUrl(endpoint.url), endpoint, attempt, "unsupported for contract reads")
          );
        }
        if (
          capabilityFailedUrls.size >= rpcManager.endpoints.length ||
          rpcManager.areAllEndpointsMethodUnavailable(rpcMethod)
        ) {
          throw new Error(
            `RPC method unsupported by all configured endpoints (${rpcManager.endpoints.length}) for ${rpcMethod}: ${
              (error as { message?: string })?.message ?? String(error)
            }`
          );
        }
        continue;
      }

      if (isRateLimitError(error)) {
        rpcManager.markRateLimited(endpoint.url, error, rpcMethod);
        if (attempt === 0 && onRateLimitMessage) {
          console.warn(
            onRateLimitMessage(rpcShortUrl(endpoint.url), endpoint, attempt, "rate-limited")
          );
        }
        continue;
      }

      if (!isRetryableError(error)) {
        throw error;
      }
      if (attempt === maxAttempts - 1) {
        rpcManager.markError(endpoint.url, rpcMethod);
        throw error;
      }

      rpcManager.markError(endpoint.url, rpcMethod);
      if (rpcManager.msUntilAnyEndpointAvailable(rpcMethod) === 0) {
        continue;
      }

      const delay = Math.min(
        RPC_BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * 200,
        RPC_MAX_DELAY_MS
      );

      if (attempt === 0 && onRetryMessage) {
        console.warn(
          onRetryMessage(rpcShortUrl(endpoint.url), Math.round(delay), endpoint, attempt)
        );
      }

      await new Promise((resolve) => setTimeout(resolve, delay));
    } finally {
      rpcManager.releaseEndpoint(endpoint.url);
    }
  }

  throw lastError;
}

/**
 * Execute a viem readContract call with exponential backoff on retryable errors.
 *
 * On a 429 the current endpoint is marked as rate-limited and the next
 * best endpoint is tried immediately (up to RPC_MAX_RETRIES total attempts).
 *
 * @param {object} params  Same params as publicClient.readContract()
 * @returns {Promise<any>} The contract call result
 * @throws After RPC_MAX_RETRIES exhausted across all endpoints
 */
export async function readContractWithRetry(params: any) {
  return executeWithRpcRetry(
    (client: any) => client.readContract(params),
    {
      method: "eth_call",
      onRateLimitMessage: (shortUrl: any, _endpoint: any, _attempt: any, reason = "rate-limited") =>
        `    RPC ${reason} on ${shortUrl}, switching endpoint...`,
      onRetryMessage: (shortUrl: any, delayMs: any) =>
        `    RPC error on ${shortUrl}, retrying in ${delayMs}ms...`,
    }
  );
}

/**
 * Execute a viem multicall with the same endpoint failover and retry policy as
 * readContractWithRetry().
 *
 * @param {object} params  Same params as publicClient.multicall()
 * @returns {Promise<any[]>} The multicall results
 */
export async function multicallWithRetry(params: any) {
  return executeWithRpcRetry(
    (client: any) => client.multicall(params),
    {
      method: "eth_call",
      onRateLimitMessage: (shortUrl: any, _endpoint: any, _attempt: any, reason = "rate-limited") =>
        `    RPC ${reason} on ${shortUrl} during multicall, switching endpoint...`,
      onRetryMessage: (shortUrl: any, delayMs: any) =>
        `    RPC multicall error on ${shortUrl}, retrying in ${delayMs}ms...`,
    }
  );
}

/**
 * True for viem readContract failures where the address returned no calldata.
 *
 * This usually means one of:
 *   - the address is not a contract
 *   - the contract does not implement the requested selector
 *   - the pool was misclassified for its protocol family
 *
 * These are permanent data-quality issues, not transient RPC transport errors.
 *
 * @param {unknown} error
 * @returns {boolean}
 */
export function isNoDataReadContractError(error: any) {
  const msg = String(error?.message ?? error ?? "").toLowerCase();
  return msg.includes('returned no data ("0x")');
}

// ─── Concurrency limiter ───────────────────────────────────────

/**
 * Run an async function over an array with bounded concurrency.
 *
 * @param {T[]} items           Items to process
 * @param {(item: T, index: number) => Promise<R>} fn  Async worker
 * @param {number} concurrency  Max parallel workers (default 3)
 * @returns {Promise<R[]>}      Results in original order
 */
export async function throttledMap<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency = 3,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await fn(items[i], i);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker()
  );
  await Promise.all(workers);

  return results;
}

// ─── Helpers ───────────────────────────────────────────────────

function rpcShortUrl(url: any) {
  try {
    const u = new URL(url);
    return u.hostname;
  } catch {
    return url.slice(0, 40);
  }
}
