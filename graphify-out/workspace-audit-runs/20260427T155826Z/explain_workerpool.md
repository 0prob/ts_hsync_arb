```bash
graphify explain WorkerPool
```

Node: WorkerPool
  ID:        worker_pool_workerpool
  Source:    src/routing/worker_pool.ts L285
  Type:      code
  Community: 9
  Degree:    20

Connections (20):
  --> worker_pool.ts [contains] [EXTRACTED]
  --> .evaluate() [method] [EXTRACTED]
  --> .enumerate() [method] [EXTRACTED]
  --> ._buildStateDelta() [method] [EXTRACTED]
  --> ._rejectAllPending() [method] [EXTRACTED]
  --> .init() [method] [EXTRACTED]
  --> ._dispatchToSlot() [method] [EXTRACTED]
  --> ._evaluateOnSlot() [method] [EXTRACTED]
  --> ._rejectSlotPending() [method] [EXTRACTED]
  --> ._drainQueue() [method] [EXTRACTED]
  --> .terminate() [method] [EXTRACTED]
  --> ._submitToSlot() [method] [EXTRACTED]
  --> ._spawnSlot() [method] [EXTRACTED]
  --> ._activeWorkerCount() [method] [EXTRACTED]
  --> ._enumerateOnSlot() [method] [EXTRACTED]
  --> .constructor() [method] [EXTRACTED]
  --> ._submit() [method] [EXTRACTED]
  --> .queueDepth() [method] [EXTRACTED]
  --> .size() [method] [EXTRACTED]
  --> .initialized() [method] [EXTRACTED]
