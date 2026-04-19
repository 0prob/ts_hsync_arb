
/**
 * src/state/poll_univ3.js — Continuous V3 tick + liquidity state poller
 *
 * Fetches slot0, liquidity, tick bitmap, and initialized tick data for all
 * active V3 pools (Uniswap V3, QuickSwap V3, SushiSwap V3) and writes
 * normalized state into a shared in-memory cache.
 *
 * Usage:
 *   import { PollUniv3 } from "./poll_univ3.js";
 *   const poller = new PollUniv3(registry, stateCache, { concurrency: 2 });
 *   await poller.poll();
 *   poller.start(20_000);
 *   poller.stop();
 */

import { fetchMultipleV3States } from "./index.ts";
import { normalizeV3State } from "./normalizer.ts";
import { TimedPoller } from "./poller_base.ts";

// ─── Protocols covered ────────────────────────────────────────

const V3_PROTOCOLS = new Set([
  "UNISWAP_V3",
  "QUICKSWAP_V3",
  "SUSHISWAP_V3",
]);

// ─── Poller class ─────────────────────────────────────────────

export class PollUniv3 extends TimedPoller {
  private _registry: any;
  private _cache: Map<string, any>;
  private _concurrency: number;
  private _maxPools: number;

  constructor(registry: any, stateCache: Map<string, any>, options: any = {}) {
    super(options);
    this._registry = registry;
    this._cache = stateCache;
    this._concurrency = options.concurrency ?? 2;
    this._maxPools = options.maxPools ?? 500;
  }

  // ─── Single poll pass ───────────────────────────────────────

  /**
   * Fetch V3 pool state for all active V3 pools and update the cache.
   *
   * @returns {Promise<{ updated: number, failed: number, durationMs: number }>}
   */
  async poll() {
    const t0 = Date.now();

    const pools = this._registry.getActivePoolsMeta()
      .filter((p: any) => V3_PROTOCOLS.has(p.protocol))
      .slice(0, this._maxPools);

    if (pools.length === 0) {
      return { updated: 0, failed: 0, durationMs: Date.now() - t0 };
    }

    const addresses = pools.map((p: any) => p.pool_address);

    // Build per-pool metadata so Algebra pools (QuickSwap V3) use globalState()
    // instead of slot0(), while standard Uniswap V3 forks use slot0().
    const poolMeta = new Map();
    for (const pool of pools) {
      const meta = pool.metadata || {};
      if (meta.isAlgebra) {
        poolMeta.set(pool.pool_address.toLowerCase(), { isAlgebra: true });
      }
    }

    // Batch-fetch V3 state (expensive — full tick bitmap + tick data)
    const statesMap = await fetchMultipleV3States(addresses, this._concurrency, poolMeta);

    let updated = 0;
    let failed = 0;

    for (const pool of pools) {
      const addr = pool.pool_address.toLowerCase();
      const rawState = statesMap.get(addr);

      if (!rawState) {
        failed++;
        continue;
      }

      const normalized = normalizeV3State(
        addr,
        pool.protocol,
        pool.tokens,
        rawState,
        pool.metadata
      );

      this._cache.set(addr, normalized);
      updated++;

      if (this._verbose) {
        console.log(
          `[poll_univ3] ${addr} tick=${rawState.tick} liq=${rawState.liquidity}`
        );
      }
    }

    return this._completePass("poll_univ3", t0, updated, failed);
  }

  // ─── Continuous polling ──────────────────────────────────────

  /**
   * Start continuous polling.
   *
   * Note: V3 state fetches are slow (many RPC sub-calls per pool).
   * Recommended interval is 20–60 seconds.
   *
   * @param {number} intervalMs  Milliseconds between polls
   */
  start(intervalMs = 30_000) {
    this._startLoop("poll_univ3", intervalMs, () => this.poll());
  }
}
