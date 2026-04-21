export function createRegistryRepositories(registry: any) {
  return {
    pools: {
      getAll: (opts?: any) => registry.getPools(opts),
      getActive: () => registry.getActivePools(),
      getActiveMeta: () => registry.getActivePoolsMeta(),
      getMeta: (address: string) => registry.getPoolMeta(address),
      batchUpsert: (pools: any[]) => registry.batchUpsertPools(pools),
      batchUpdateStates: (states: any[]) => registry.batchUpdateStates(states),
      disable: (address: string, reason: string) => registry.disablePool(address, reason),
      invalidateMetaCache: () => registry.invalidatePoolMetaCache?.(),
    },
    checkpoints: {
      get: (key: string) => registry.getCheckpoint(key),
      getGlobal: () => registry.getGlobalCheckpoint?.(),
      set: (key: string, block: number) => registry.setCheckpoint(key, block),
    },
    tokens: {
      getMeta: (address: string) => registry.getTokenMeta(address),
      getDecimals: (addresses: string[]) => registry.getTokenDecimals?.(addresses),
      batchUpsertMeta: (rows: any[]) => registry.batchUpsertTokenMeta?.(rows),
    },
  };
}
