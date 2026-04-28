```bash
graphify path scoreRoute\(\) buildArbTx\(\)
```

Shortest path (3 hops):
  scoreRoute() --calls [INFERRED]--> getPathHopCount() --calls [INFERRED]--> gasEstimateCacheKeyForRoute() --calls [EXTRACTED]--> buildArbTx()
