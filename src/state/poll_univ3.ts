
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

// ─── Protocols covered ────────────────────────────────────────

const V3_PROTOCOLS = new Set([
  "UNISWAP_V3",
  "QUICKSWAP_V3",
  "SUSHISWAP_V3",
]);

// ─── Poller class ─────────────────────────────────────────────

export class PollUniv3 {
  private _registry: any;
  private _cache: Map<string, any>;
  private _concurrency: number;
  private _verbose: boolean;
  private _maxPools: number;
  private _timer: ReturnType<typeof setTimeout> | null;
  private _running: boolean;
  private _passCount: number;

  constructor(registry: any, stateCache: Map<string, any>, options: any = {}) {
    this._registry = registry;
    this._cache = stateCache;
    this._concurrency = options.concurrency ?? 2;
    this._verbose = options.verbose ?? false;
    this._maxPools = options.maxPools ?? 500;
    this._timer = null;
    this._running = false;
    this._passCount = 0;
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

    const durationMs = Date.now() - t0;
    this._passCount++;

    console.log(
      `[poll_univ3] Pass #${this._passCount}: ${updated} updated, ${failed} failed (${durationMs}ms)`
    );

    return { updated, failed, durationMs };
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
    if (this._running) return;
    this._running = true;

    const loop = async () => {
      if (!this._running) return;
      try {
        await this.poll();
      } catch (err: any) {
        console.error(`[poll_univ3] Poll error: ${err.message}`);
      }
      if (this._running) {
        this._timer = setTimeout(loop, intervalMs);
      }
    };

    loop();
  }

  stop() {
    this._running = false;
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }

  get isRunning() {
    return this._running;
  }
}
