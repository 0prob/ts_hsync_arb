
/**
 * src/state/cache_utils.js — Cache merge/reload helpers used by the watcher
 *
 * Kept dependency-free so recovery logic can be tested without loading the
 * HyperSync client.
 */

export function mergeStateIntoCache(cache, addr, nextState) {
  const current = cache.get(addr);
  if (!current) {
    cache.set(addr, nextState);
    return nextState;
  }

  for (const key of Object.keys(current)) {
    if (!Object.hasOwn(nextState, key)) {
      delete current[key];
    }
  }

  for (const [key, value] of Object.entries(nextState)) {
    current[key] = value;
  }

  return current;
}

export function reloadCacheFromRegistry(registry, cache, pendingEnrichment = new Map()) {
  const pools = registry.getPools({ status: "active" });
  const nextAddrs = new Set();

  for (const pool of pools) {
    const addr = pool.pool_address.toLowerCase();
    nextAddrs.add(addr);

    let nextState;
    if (pool.state?.data) {
      nextState = pool.state.data;
    } else {
      // Use an identity-field placeholder so validatePoolState can progress past
      // poolId/protocol/tokens checks once the watcher re-populates numeric fields.
      let tokens;
      try {
        tokens = typeof pool.tokens === "string" ? JSON.parse(pool.tokens) : pool.tokens;
      } catch { tokens = []; }
      nextState = {
        poolId: addr,
        protocol: pool.protocol,
        tokens: Array.isArray(tokens) ? tokens.map((t) => t.toLowerCase()) : [],
        timestamp: 0,
      };
    }

    const merged = mergeStateIntoCache(cache, addr, nextState);
    cache.set(addr, merged);
  }

  for (const addr of [...cache.keys()]) {
    if (!nextAddrs.has(addr)) {
      cache.delete(addr);
      pendingEnrichment.delete(addr);
    }
  }

  return nextAddrs;
}
