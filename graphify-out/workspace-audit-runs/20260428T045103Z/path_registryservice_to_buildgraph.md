```bash
graphify path RegistryService buildGraph\(\)
```

Shortest path (4 hops):
  RegistryService --contains [EXTRACTED]--> registry.ts --imports_from [EXTRACTED]--> runner.ts --imports_from [EXTRACTED]--> graph.ts --contains [EXTRACTED]--> buildGraph()
