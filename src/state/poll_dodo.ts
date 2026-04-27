/**
 * DODO V2 PMM state poller.
 *
 * DODO DVM/DPP/DSP pools mutate reserves and, for DPP/DSP, PMM targets on
 * swaps. We fetch the full PMMState instead of trying to apply log deltas.
 */

import { ENRICH_CONCURRENCY } from "../config/index.ts";
import { DODO_PROTOCOLS, normalizeProtocolKey } from "../protocols/classification.ts";
import { fetchDodoPoolState } from "./dodo.ts";
import { normalizeDodoState } from "./normalizer.ts";
import { metadataWithTokenDecimals } from "./pool_metadata.ts";
import { parsePoolTokens } from "./pool_record.ts";
import { asBatchResult, TimedPoller } from "./poller_base.ts";
import { throttledMap } from "../enrichment/rpc.ts";

export async function fetchAndNormalizeDodoPool(pool: any, options: { tokenDecimals?: Map<string, number> | null } = {}) {
  const addr = pool.pool_address.toLowerCase();
  const rawState = await fetchDodoPoolState(addr);
  const fallbackTokens = parsePoolTokens(pool.tokens);
  const tokens = rawState.baseToken && rawState.quoteToken
    ? [rawState.baseToken, rawState.quoteToken]
    : fallbackTokens;
  const metadata = metadataWithTokenDecimals(pool, tokens, options.tokenDecimals);
  const normalized = normalizeDodoState(addr, pool.protocol, tokens, rawState, metadata);

  return { addr, normalized };
}

export class PollDodo extends TimedPoller {
  private _registry: any;
  private _cache: Map<string, any>;
  private _concurrency: number;

  constructor(registry: any, stateCache: Map<string, any>, options: any = {}) {
    super(options);
    this._registry = registry;
    this._cache = stateCache;
    this._concurrency = options.concurrency ?? ENRICH_CONCURRENCY;
  }

  async poll() {
    const t0 = Date.now();

    const pools = this._registry.getActivePoolsMeta().filter((p: any) =>
      DODO_PROTOCOLS.has(normalizeProtocolKey(p.protocol))
    );

    if (pools.length === 0) {
      return { updated: 0, failed: 0, durationMs: Date.now() - t0 };
    }

    const results = await throttledMap(
      pools,
      async (pool: any) => {
        try {
          const tokens = parsePoolTokens(pool.tokens);
          const tokenDecimals = this._registry.getTokenDecimals(tokens);
          const { addr, normalized } = await fetchAndNormalizeDodoPool(pool, { tokenDecimals });
          return asBatchResult(addr, normalized);
        } catch (err) {
          const addr = pool.pool_address.toLowerCase();
          return asBatchResult(addr, null, err);
        }
      },
      this._concurrency,
    );

    const { updated, failed } = this._storeBatchResults(
      "poll_dodo",
      this._cache,
      results,
      ({ addr, normalized }) => `[poll_dodo] ${addr} B=${normalized.baseReserve} Q=${normalized.quoteReserve}`,
    );

    return this._completePass("poll_dodo", t0, updated, failed);
  }

  start(intervalMs = 15_000) {
    this._startLoop("poll_dodo", intervalMs, () => this.poll());
  }
}
