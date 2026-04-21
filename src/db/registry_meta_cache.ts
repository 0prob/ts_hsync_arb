
/**
 * src/db/registry_meta_cache.js — Metadata cache helper for RegistryService
 */

import { loadPoolMetaCache } from "./registry_pools.ts";

export class RegistryMetaCache {
  _stmt: any;
  _poolMetaCache: any;
  _activePoolMetaCache: any;

  constructor(stmt: any) {
    this._stmt = stmt;
    this._poolMetaCache = null;
    this._activePoolMetaCache = null;
  }

  invalidate() {
    this._poolMetaCache = null;
    this._activePoolMetaCache = null;
  }

  getAll() {
    if (!this._poolMetaCache) {
      this._poolMetaCache = loadPoolMetaCache(this._stmt);
    }
    return this._poolMetaCache;
  }

  getActive() {
    if (!this._activePoolMetaCache) {
      this._activePoolMetaCache = loadPoolMetaCache(this._stmt, "active");
    }
    return this._activePoolMetaCache;
  }

  get(address: any) {
    return this.getAll().get(address.toLowerCase()) ?? null;
  }
}
