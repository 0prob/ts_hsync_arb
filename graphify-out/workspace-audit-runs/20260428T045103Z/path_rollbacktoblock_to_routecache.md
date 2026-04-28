```bash
graphify path rollbackToBlock\(\) RouteCache
```

Shortest path (4 hops):
  .rollbackToBlock() --method [EXTRACTED]--> RegistryService --method [EXTRACTED]--> .invalidateAssetCaches() --calls [INFERRED]--> .clear() --method [EXTRACTED]--> RouteCache
