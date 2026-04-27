```bash
graphify path RouteCache sendTx\(\)
```

Shortest path (4 hops):
  RouteCache --method [EXTRACTED]--> .getByPools() --calls [INFERRED]--> get() --calls [INFERRED]--> .next() --calls [INFERRED]--> sendTx()
