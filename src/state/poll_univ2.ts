
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

// ─── Protocols covered ────────────────────────────────────────

const V2_PROTOCOLS = new Set(["QUICKSWAP_V2", "SUSHISWAP_V2", "UNISWAP_V2"]);

// ─── Poller class ─────────────────────────────────────────────

export class PollUniv2 {
  /**
   * @param {import('../db/registry.ts').RegistryService} registry
   *   Live registry for pool metadata queries.
   * @param {Map<string, Object>} stateCache
   *   Shared map: lowercase poolAddress → canonical pool state.
   *   Updated in-place after each poll.
   * @param {Object} [options]
   * @param {number} [options.concurrency=10]  Max parallel RPC fetches
   * @param {boolean} [options.verbose=false]  Log individual pool updates
   */
  constructor(registry, stateCache, options = {}) {
    this._registry = registry;
    this._cache = stateCache;
    this._concurrency = options.concurrency ?? 10;
    this._verbose = options.verbose ?? false;
    this._timer = null;
    this._running = false;
    this._passCount = 0;
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
      (p) => V2_PROTOCOLS.has(p.protocol)
    );

    if (pools.length === 0) {
      return { updated: 0, failed: 0, durationMs: Date.now() - t0 };
    }

    const addresses = pools.map((p) => p.pool_address);

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

      const normalized = normalizeV2State(
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
          `[poll_univ2] ${addr} r0=${rawState.reserve0} r1=${rawState.reserve1}`
        );
      }
    }

    const durationMs = Date.now() - t0;
    this._passCount++;

    console.log(
      `[poll_univ2] Pass #${this._passCount}: ${updated} updated, ${failed} failed (${durationMs}ms)`
    );

    return { updated, failed, durationMs };
  }

  // ─── Continuous polling ──────────────────────────────────────

  /**
   * Start continuous polling with a given interval.
   *
   * @param {number} intervalMs  Milliseconds between polls
   */
  start(intervalMs = 15_000) {
    if (this._running) return;
    this._running = true;

    const loop = async () => {
      if (!this._running) return;
      try {
        await this.poll();
      } catch (err) {
        console.error(`[poll_univ2] Poll error: ${err.message}`);
      }
      if (this._running) {
        this._timer = setTimeout(loop, intervalMs);
      }
    };

    // Run immediately then on interval
    loop();
  }

  /**
   * Stop the continuous poller.
   */
  stop() {
    this._running = false;
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }

  /** @returns {boolean} Whether the poller is running */
  get isRunning() {
    return this._running;
  }
}
