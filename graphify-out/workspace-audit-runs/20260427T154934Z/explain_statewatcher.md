```bash
graphify explain StateWatcher
```

Node: StateWatcher
  ID:        watcher_statewatcher
  Source:    src/state/watcher.ts L467
  Type:      code
  Community: 4
  Degree:    32

Connections (32):
  --> watcher.ts [contains] [EXTRACTED]
  --> ._loop() [method] [EXTRACTED]
  --> ._pollOnce() [method] [EXTRACTED]
  --> .start() [method] [EXTRACTED]
  --> ._refreshV3() [method] [EXTRACTED]
  --> ._refreshBalancer() [method] [EXTRACTED]
  --> ._refreshCurve() [method] [EXTRACTED]
  --> ._commitState() [method] [EXTRACTED]
  --> ._mergeState() [method] [EXTRACTED]
  --> ._refreshDodo() [method] [EXTRACTED]
  --> ._refreshWoofi() [method] [EXTRACTED]
  --> .restart() [method] [EXTRACTED]
  --> ._buildQueries() [method] [EXTRACTED]
  --> ._sleep() [method] [EXTRACTED]
  --> ._waitForHeightAdvance() [method] [EXTRACTED]
  --> ._handleLogs() [method] [EXTRACTED]
  --> ._enqueueEnrichment() [method] [EXTRACTED]
  --> ._reloadCacheFromRegistry() [method] [EXTRACTED]
  --> ._resetRunState() [method] [EXTRACTED]
  --> .stop() [method] [EXTRACTED]
  ... and 12 more
