import { getPoolTokens, normalizeEvmAddress } from "../util/pool_record.ts";

type LogLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace";
type LoggerFn = (msg: string, level?: LogLevel, meta?: unknown) => void;

type PoolRecord = {
  pool_address: string;
  protocol: string;
  tokens: unknown;
  metadata?: unknown;
  status?: string;
  state?: { data?: Record<string, unknown> };
};

type PoolState = Record<string, unknown>;
type StateCache = Map<string, PoolState>;

type DiscoveryRefreshDeps = {
  isRunning: () => boolean;
  log: LoggerFn;
  getRepositories: () => {
    pools: {
      invalidateMetaCache: () => void;
      getActiveMeta: () => PoolRecord[];
    };
  } | null;
  stateCache: StateCache;
  getWatcher: () => { addPools: (poolAddresses: string[]) => Promise<unknown> } | null | undefined;
  isHydratablePool: (pool: PoolRecord) => boolean;
  claimDeferredHydration: (pools: PoolRecord[]) => PoolRecord[];
  releaseDeferredHydration: (pools: PoolRecord[]) => void;
  fetchAndCacheStates: (pools: PoolRecord[], options: Record<string, unknown>) => Promise<unknown>;
  validatePoolState: (state: PoolState | undefined) => { valid: boolean };
  clearDeferredHydrationRetry: (address: string) => void;
  recordDeferredHydrationFailure: (address: string, reason: string) => void;
  topology: { invalidate: (reason?: string) => void } | null;
  refreshCycles: (force?: boolean) => Promise<unknown>;
  v3NearWordRadius: number;
};

export function seedNewPoolsIntoStateCache(pools: PoolRecord[], stateCache: StateCache) {
  const newPools: PoolRecord[] = [];
  for (const pool of pools) {
    const poolAddress = normalizeEvmAddress(pool.pool_address);
    if (!poolAddress) continue;
    if (stateCache.has(poolAddress)) continue;
    stateCache.set(poolAddress, {
      poolId: poolAddress,
      protocol: pool.protocol,
      tokens: getPoolTokens(pool),
      timestamp: 0,
    });
    newPools.push({ ...pool, pool_address: poolAddress });
  }
  return newPools;
}

export function createDiscoveryRefreshCoordinator(deps: DiscoveryRefreshDeps) {
  async function reconcileDiscoveryResult(result: { totalDiscovered?: number } | null | undefined) {
    if (!deps.isRunning() || !result?.totalDiscovered) return;

    const repositories = deps.getRepositories();
    repositories?.pools.invalidateMetaCache();
    const allPools = repositories?.pools.getActiveMeta() ?? [];
    const newPools = seedNewPoolsIntoStateCache(allPools, deps.stateCache);

    if (newPools.length > 0) {
      await deps.getWatcher()?.addPools(newPools.map((pool) => pool.pool_address.toLowerCase()));
      if (!deps.isRunning()) return;

      const claimedNewPools = deps.claimDeferredHydration(newPools.filter((pool) => deps.isHydratablePool(pool)));
      try {
        if (claimedNewPools.length > 0) {
          await deps.fetchAndCacheStates(claimedNewPools, {
            v3HydrationMode: "nearby",
            v3NearWordRadius: deps.v3NearWordRadius,
            logContext: {
              label: "Discovery hydration",
              eventPrefix: "discovery_hydration",
            },
          });

          for (const pool of claimedNewPools) {
            const addr = pool.pool_address.toLowerCase();
            if (deps.validatePoolState(deps.stateCache.get(addr)).valid) {
              deps.clearDeferredHydrationRetry(addr);
            } else {
              deps.recordDeferredHydrationFailure(addr, "state_not_routable_after_discovery_hydration");
            }
          }
        }

        if (!deps.isRunning()) return;
      } finally {
        deps.releaseDeferredHydration(claimedNewPools);
      }
    }

    deps.topology?.invalidate("background_discovery");
    await deps.refreshCycles(true);
  }

  return {
    reconcileDiscoveryResult,
  };
}
