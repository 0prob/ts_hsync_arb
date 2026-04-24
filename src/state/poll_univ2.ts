
/**
 * src/state/poll_univ2.js — Continuous V2 reserve state poller
 *
 * Fetches getReserves() for all active V2 pools (QuickSwap V2, SushiSwap V2,
 * Uniswap V2 forks) and writes normalized state into a shared in-memory cache.
 *
 * Usage:
 *   import { PollUniv2 } from "./poll_univ2.js";
 *   const poller = new PollUniv2(registry, stateCache, { concurrency: 10 });
 *   await poller.poll();   // single pass
 *   poller.start(15_000);  // continuous, every 15s
 *   poller.stop();
 */

import { fetchMultipleV2States } from "./uniswap_v2.ts";
import { normalizeV2State } from "./normalizer.ts";
import { TimedPoller } from "./poller_base.ts";
import { mergeStateIntoCache } from "./cache_utils.ts";
import { parsePoolTokens } from "./pool_record.ts";
import { metadataWithRegistryTokenDecimals } from "./pool_metadata.ts";

// ─── Protocols covered ────────────────────────────────────────

const V2_PROTOCOLS = new Set(["QUICKSWAP_V2", "SUSHISWAP_V2", "UNISWAP_V2", "DFYN_V2", "COMETHSWAP_V2"]);

// ─── Poller class ─────────────────────────────────────────────

export class PollUniv2 extends TimedPoller {
  private _registry: any;
  private _cache: Map<string, any>;
  private _concurrency: number;

  constructor(registry: any, stateCache: Map<string, any>, options: any = {}) {
    super(options);
    this._registry = registry;
    this._cache = stateCache;
    this._concurrency = options.concurrency ?? 10;
  }

  // ─── Single poll pass ───────────────────────────────────────

  /**
   * Fetch reserves for all active V2 pools and update the state cache.
   *
   * @returns {Promise<{ updated: number, failed: number, durationMs: number }>}
   */
  async poll() {
    const t0 = Date.now();

    // Load active V2 pools from registry
    const pools = this._registry.getActivePoolsMeta().filter(
      (p: any) => V2_PROTOCOLS.has(p.protocol)
    );

    if (pools.length === 0) {
      return { updated: 0, failed: 0, durationMs: Date.now() - t0 };
    }

    const addresses = pools.map((p: any) => p.pool_address);

    // Batch-fetch reserves
    const statesMap = await fetchMultipleV2States(addresses, this._concurrency);

    // Normalize and store in cache
    let updated = 0;
    let failed = 0;

    for (const pool of pools) {
      const addr = pool.pool_address.toLowerCase();
      const rawState = statesMap.get(addr);
      
      if (!rawState) {
        failed++;
        continue;
      }

      const tokens = parsePoolTokens(pool.tokens);
      const metadata = metadataWithRegistryTokenDecimals(this._registry, pool, tokens);
      const normalized = normalizeV2State(addr, pool.protocol, tokens, rawState, metadata);

      mergeStateIntoCache(this._cache, addr, normalized);
      updated++;

      if (this._verbose) {
        console.log(
          `[poll_univ2] ${addr} r0=${rawState.reserve0} r1=${rawState.reserve1}`
        );
      }
    }

    return this._completePass("poll_univ2", t0, updated, failed);
  }

  // ─── Continuous polling ──────────────────────────────────────

  /**
   * Start continuous polling with a given interval.
   *
   * @param {number} intervalMs  Milliseconds between polls
   */
  start(intervalMs = 15_000) {
    this._startLoop("poll_univ2", intervalMs, () => this.poll());
  }
}
