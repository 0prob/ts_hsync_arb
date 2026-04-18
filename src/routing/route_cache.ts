
/**
 * src/routing/route_cache.js — Top-N profitable route cache
 *
 * Stores the top `maxSize` (default 1 000) profitable arbitrage routes found
 * during previous simulation passes.  On every HyperSync batch the watcher
 * reports which pools changed; the cache returns only the routes that touch
 * those pools so they can be re-validated cheaply without re-running a full
 * cycle enumeration.
 *
 * Lifecycle
 * ─────────
 *   1. After each arb scan, call cache.update(profitable)
 *      where profitable = [{ path, result }] sorted by profit desc.
 *   2. On watcher.onBatch(changedAddrs), call cache.getByPools(changedAddrs)
 *      and re-simulate those paths first (fast, targeted).
 *   3. Periodically call cache.prune(stateCache) to drop routes whose pools
 *      are no longer in the state cache (removed pools).
 *
 * Thread safety: single-threaded (main thread only).
 */

import { routeKeyFromEdges } from "./finder.ts";

export class RouteCache {
  private _maxSize: number;
  private _routes: any[];
  private _poolIndex: Map<string, Set<number>>;

  constructor(maxSize = 1_000) {
    this._maxSize = maxSize;
    this._routes = [];
    this._poolIndex = new Map();
  }

  // ─── Mutation ──────────────────────────────────────────────

  /**
   * Update the cache with fresh simulation results.
   *
   * Merges new profitable routes with existing ones, re-ranks by profit, and
   * keeps only the top `maxSize`.  Rebuilds the pool index from scratch.
   *
   * @param {Array<{ path: object, result: object }>} profitable
   *   Profitable routes from evaluatePaths / evaluatePathsParallel.
   */
  update(profitable) {
    if (!profitable || profitable.length === 0) return;

    // Normalise profit to BigInt (workers deserialise as strings)
    const toAdd = profitable.map(({ path, result }) => ({
      path,
      result,
      profit: typeof result.profit === "bigint" ? result.profit : BigInt(result.profit),
    }));

    // Merge with existing routes, then sort and cap
    const merged = [...this._routes, ...toAdd];
    merged.sort((a, b) => (b.profit > a.profit ? 1 : b.profit < a.profit ? -1 : 0));

    // Deduplicate by ordered route key. Pool-set-only dedup drops
    // order-sensitive cyclic routes that can still execute differently.
    const seen = new Set();
    const deduped = [];
    for (const entry of merged) {
      const key = routeKeyFromEdges(entry.path.startToken, entry.path.edges);
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(entry);
        if (deduped.length >= this._maxSize) break;
      }
    }

    this._routes = deduped;
    this._rebuildIndex();
  }

  // ─── Query ─────────────────────────────────────────────────

  /**
   * Return cached routes that include at least one of the changed pools.
   *
   * Used by the watcher callback to fast-revalidate affected routes before
   * running a full arb scan.
   *
   * @param {Set<string>|string[]} changedPools  Lowercase pool addresses
   * @returns {Array<{ path: object, result: object }>}
   */
  getByPools(changedPools) {
    const idxSet = new Set();
    for (const pool of changedPools) {
      const hits = this._poolIndex.get(pool.toLowerCase());
      if (hits) for (const i of hits) idxSet.add(i);
    }
    return [...idxSet].map((i) => this._routes[i]).filter(Boolean);
  }

  /**
   * Return all cached routes.
   *
   * @returns {Array<{ path: object, result: object }>}
   */
  getAll() {
    return this._routes;
  }

  /**
   * Number of cached routes.
   * @returns {number}
   */
  get size() {
    return this._routes.length;
  }

  // ─── Maintenance ───────────────────────────────────────────

  /**
   * Remove routes containing pools that are no longer in stateCache.
   * Call after watcher restarts or pool removals.
   *
   * @param {Map<string, object>} stateCache
   */
  prune(stateCache) {
    const before = this._routes.length;
    this._routes = this._routes.filter((entry) =>
      entry.path.edges.every((e) => stateCache.has(e.poolAddress))
    );
    if (this._routes.length < before) this._rebuildIndex();
  }

  /**
   * Remove cached routes that touch any pool in the provided set.
   *
   * Useful when a watcher batch makes specific pools unroutable while the rest
   * of the cache remains valid.
   *
   * @param {Set<string>|string[]} poolAddresses
   * @returns {number} number of removed routes
   */
  removeByPools(poolAddresses) {
    const blocked = new Set([...poolAddresses].map((pool) => pool.toLowerCase()));
    if (blocked.size === 0 || this._routes.length === 0) return 0;

    const before = this._routes.length;
    this._routes = this._routes.filter((entry) =>
      entry.path.edges.every((edge) => !blocked.has(edge.poolAddress.toLowerCase()))
    );
    if (this._routes.length < before) this._rebuildIndex();
    return before - this._routes.length;
  }

  /**
   * Clear the cache.
   */
  clear() {
    this._routes  = [];
    this._poolIndex.clear();
  }

  // ─── Internal ──────────────────────────────────────────────

  _rebuildIndex() {
    this._poolIndex.clear();
    for (let i = 0; i < this._routes.length; i++) {
      for (const edge of this._routes[i].path.edges) {
        const pool = edge.poolAddress;
        if (!this._poolIndex.has(pool)) this._poolIndex.set(pool, new Set());
        this._poolIndex.get(pool).add(i);
      }
    }
  }
}
