
/**
 * src/db/registry_meta_cache.js — Metadata cache helper for RegistryService
 */

import { normalizeEvmAddress } from "../util/pool_record.ts";
import { loadPoolMetaCache } from "./registry_pools.ts";

export class RegistryMetaCache {
  _stmt: any;
  _poolMetaCache: any;
  _activePoolMetaCache: any;
  _activePoolMetaByAddressCache: any;

  constructor(stmt: any) {
    this._stmt = stmt;
    this._poolMetaCache = null;
    this._activePoolMetaCache = null;
    this._activePoolMetaByAddressCache = null;
  }

  invalidate() {
    this._poolMetaCache = null;
    this._activePoolMetaCache = null;
    this._activePoolMetaByAddressCache = null;
  }

  getAll() {
    if (!this._poolMetaCache) {
      this._poolMetaCache = loadPoolMetaCache(this._stmt);
    }
    return this._poolMetaCache;
  }

  getActive() {
    if (!this._activePoolMetaCache) {
      const activePools = loadPoolMetaCache(this._stmt, "active");
      this._activePoolMetaCache = activePools;
      this._activePoolMetaByAddressCache = new Map(
        activePools.map((pool: any) => [pool.pool_address, pool]),
      );
    }
    return this._activePoolMetaCache;
  }

  get(address: any) {
    const normalizedAddress = normalizeEvmAddress(address);
    if (!normalizedAddress) return null;

    if (this._activePoolMetaByAddressCache?.has(normalizedAddress)) {
      return this._activePoolMetaByAddressCache.get(normalizedAddress) ?? null;
    }
    if (this._poolMetaCache) {
      return this._poolMetaCache.get(normalizedAddress) ?? null;
    }
    return this.getAll().get(normalizedAddress) ?? null;
  }
}
