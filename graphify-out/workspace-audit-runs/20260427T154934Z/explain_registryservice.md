```bash
graphify explain RegistryService
```

Node: RegistryService
  ID:        registry_registryservice
  Source:    src/db/registry.ts L72
  Type:      code
  Community: 10
  Degree:    61

Connections (61):
  --> registry.ts [contains] [EXTRACTED]
  --> .getTokenDecimals() [method] [EXTRACTED]
  --> .getActivePoolsMeta() [method] [EXTRACTED]
  --> ._normalizeTokenAddress() [method] [EXTRACTED]
  --> ._refreshTokenMetaCacheAfterWrite() [method] [EXTRACTED]
  --> .getTokenMeta() [method] [EXTRACTED]
  --> .getPoolMeta() [method] [EXTRACTED]
  --> .getPoolFee() [method] [EXTRACTED]
  --> ._normalizePoolAddress() [method] [EXTRACTED]
  --> .getPools() [method] [EXTRACTED]
  --> .setCheckpoint() [method] [EXTRACTED]
  --> ._invalidatePoolMetaCache() [method] [EXTRACTED]
  --> ._cacheTokenMetaEntry() [method] [EXTRACTED]
  --> .getCheckpoint() [method] [EXTRACTED]
  --> .rollbackWatcherState() [method] [EXTRACTED]
  --> .constructor() [method] [EXTRACTED]
  --> ._initSchema() [method] [EXTRACTED]
  --> ._cachePoolFeeEntry() [method] [EXTRACTED]
  --> ._invalidateTokenAssetCacheEntry() [method] [EXTRACTED]
  --> ._invalidatePoolFeeCacheEntry() [method] [EXTRACTED]
  ... and 41 more
