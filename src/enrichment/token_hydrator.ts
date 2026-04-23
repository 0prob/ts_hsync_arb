
/**
 * src/enrichment/token_hydrator.js — ERC-20 metadata hydration via multicall
 *
 * Uses viem's built-in Multicall3 support to batch-fetch decimals, symbol, and
 * name for any set of token addresses in a single JSON-RPC round-trip per chunk.
 * Routes through HYPERRPC_URL (your external HyperRPC instance) with fallback
 * to the hot-path RPC pool if unavailable.
 *
 * Cost model:
 *   - 200 tokens × 3 calls = 600 eth_call targets per multicall request
 *   - allowFailure: true — a non-ERC20 token or failed call never aborts the batch
 */

import { createPublicClient, http } from "viem";
import { polygon } from "viem/chains";
import { ENRICH_CONCURRENCY, HYPERRPC_URL } from "../config/index.ts";
import { dynamicPublicClient } from "../utils/rpc_manager.ts";
import { logger } from "../utils/logger.ts";
import { isEndpointCapabilityError } from "../utils/rpc_manager.ts";
import { getPoolTokens } from "../util/pool_record.ts";
import { normalizeHydrationAddresses, normalizeTokenHydrationAddress } from "./token_hydrator_helpers.ts";
import { throttledMap } from "./rpc.ts";

// ─── HyperRPC client ──────────────────────────────────────────
//
// Separate from the hot-path RPC manager so multicall traffic doesn't compete
// with latency-sensitive arb calls for endpoint health scoring.
// Falls back to dynamicPublicClient if HYPERRPC_URL is unreachable.

const hyperRpcClient = createPublicClient({
  chain: polygon,
  transport: http(HYPERRPC_URL, {
    timeout: 30_000,
    fetchOptions: { headers: { Connection: "keep-alive" } },
  }),
});

let hyperRpcMulticallAvailable = true;

// ─── ERC-20 ABI fragments ──────────────────────────────────────

const DECIMALS_ABI = [
  { name: "decimals", type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint8" }] },
];
const SYMBOL_ABI = [
  { name: "symbol", type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "string" }] },
];
const NAME_ABI = [
  { name: "name", type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "string" }] },
];

// ─── Helpers ──────────────────────────────────────────────────

const CHUNK_SIZE = 200; // tokens per multicall → 600 call targets per request
function chunk(arr: any, size: any) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ─── Multicall batch ──────────────────────────────────────────

/**
 * Fetch decimals, symbol, and name for up to CHUNK_SIZE token addresses
 * in a single Multicall3 call.
 *
 * @param {string[]} addresses  Lowercase token addresses (max CHUNK_SIZE)
 * @returns {Promise<Array<{ address: string, decimals: number|null, symbol: string|null, name: string|null }>>}
 */
async function fetchMetaBatch(addresses: any) {
  const contracts = addresses.flatMap((addr: any) => [
    { address: addr, abi: DECIMALS_ABI, functionName: "decimals" },
    { address: addr, abi: SYMBOL_ABI,   functionName: "symbol"   },
    { address: addr, abi: NAME_ABI,     functionName: "name"     },
  ]);

  let results;
  if (hyperRpcMulticallAvailable) {
    try {
      results = await hyperRpcClient.multicall({ contracts, allowFailure: true });
    } catch (err) {
      if (isEndpointCapabilityError(err)) {
        hyperRpcMulticallAvailable = false;
        logger.warn("[token_hydrator] HyperRPC does not support multicall here — falling back to RPC manager");
      } else {
        logger.debug("[token_hydrator] HyperRPC multicall failed — falling back to RPC manager");
      }
      results = await (dynamicPublicClient as any).multicall({ contracts, allowFailure: true });
    }
  } else {
    results = await (dynamicPublicClient as any).multicall({ contracts, allowFailure: true });
  }

  const successCount = Array.isArray(results)
    ? results.filter((r) => r?.status === "success").length
    : 0;
  logger.info({
    addresses: addresses.length,
    callCount: contracts.length,
    resultCount: Array.isArray(results) ? results.length : 0,
    successCount,
  }, "[token_hydrator] multicall raw result summary");

  return addresses.map((addr: any, i: any) => {
    const dec  = results[i * 3];
    const sym  = results[i * 3 + 1];
    const name = results[i * 3 + 2];
    return {
      address:  addr,
      decimals: dec.status  === "success" ? Number(dec.result)  : null,
      symbol:   sym.status  === "success" ? String(sym.result)  : null,
      name:     name.status === "success" ? String(name.result) : null,
    };
  });
}

// ─── Public API ───────────────────────────────────────────────

/**
 * Hydrate token metadata for a list of addresses.
 *
 * Only fetches tokens not already present in the registry's token_meta table.
 * Tokens where decimals() reverts (e.g. non-ERC20) are silently skipped.
 *
 * @param {string[]} tokenAddresses  Lowercase ERC-20 addresses
 * @param {import('../db/registry.ts').RegistryService} registry
 * @returns {Promise<number>}  Number of new tokens persisted
 */
export async function hydrateTokens(tokenAddresses: any, registry: any) {
  return hydrateTokensWithDeps(tokenAddresses, registry);
}

export async function hydrateTokensWithDeps(
  tokenAddresses: any,
  registry: any,
  deps: {
    fetchMetaBatch?: (addresses: string[]) => Promise<Array<{ address: string; decimals: number | null; symbol: string | null; name: string | null }>>;
    concurrency?: number;
  } = {},
) {
  const normalizedAddresses = normalizeHydrationAddresses(tokenAddresses);
  if (normalizedAddresses.length === 0) return 0;

  // Filter to only addresses not yet in the DB — re-hydration is rare; this
  // check ensures a repeated discovery run is a no-op for existing tokens.
  const existing = registry.getTokenDecimals(normalizedAddresses);
  const toFetch  = normalizedAddresses.filter((address: any) => !existing.has(address));

  if (toFetch.length === 0) {
    logger.debug(`[token_hydrator] ${normalizedAddresses.length} token(s) already in DB — skipping`);
    return 0;
  }

  logger.info(
    `[token_hydrator] Hydrating ${toFetch.length} new token(s) via multicall ` +
    `(${chunk(toFetch, CHUNK_SIZE).length} batch(es) of up to ${CHUNK_SIZE}, concurrency=${deps.concurrency ?? ENRICH_CONCURRENCY})`
  );

  const chunks = chunk(toFetch, CHUNK_SIZE);
  const fetchBatch = deps.fetchMetaBatch ?? fetchMetaBatch;
  const hydratedPerChunk = await throttledMap(
    chunks,
    async (batch) => {
      try {
        const meta = await fetchBatch(batch);
        logger.info({
          batchSize: batch.length,
          sample: meta.slice(0, 5),
          decimalsResolved: meta.filter((m: any) => m.decimals !== null).length,
          symbolResolved: meta.filter((m: any) => m.symbol !== null).length,
          nameResolved: meta.filter((m: any) => m.name !== null).length,
        }, "[token_hydrator] batch decode summary");

        // Only persist entries where decimals resolved — symbol/name are optional
        const valid = meta.filter((m: any) => m.decimals !== null);
        if (valid.length > 0) {
          registry.batchUpsertTokenMeta(valid);
        }

        const skipped = meta.length - valid.length;
        if (skipped > 0) {
          logger.debug(`[token_hydrator] ${skipped} address(es) returned no decimals (non-ERC20 or call reverted)`);
        }
        return valid.length;
      } catch (err: any) {
        logger.warn(`[token_hydrator] Multicall chunk failed: ${err.message}`);
        return 0;
      }
    },
    Math.max(1, deps.concurrency ?? ENRICH_CONCURRENCY),
  );
  const hydrated = hydratedPerChunk.reduce((sum, count) => sum + count, 0);

  logger.info(`[token_hydrator] Done — ${hydrated}/${toFetch.length} tokens persisted`);
  return hydrated;
}

/**
 * Extract unique token addresses from a list of pool records and hydrate them.
 *
 * Convenience wrapper for post-discovery calls. Ignores the zero address.
 *
 * @param {Array<{ tokens: string[]|string }>} pools  Newly discovered pool records
 * @param {import('../db/registry.ts').RegistryService} registry
 * @returns {Promise<number>}
 */
export async function hydrateNewTokens(pools: any, registry: any) {
  const seen = new Set();
  for (const pool of pools) {
    const tokens = getPoolTokens(pool);
    if (!Array.isArray(tokens)) continue;
    for (const t of tokens) {
      const normalized = normalizeTokenHydrationAddress(t);
      if (normalized) seen.add(normalized);
    }
  }
  return hydrateTokens([...seen], registry);
}
