# Workspace Audit Pack Scope

This pack is intended to find high-impact graph-guided issues in the arbitrage
bot, not to produce a static architecture report. It should stay aligned with:

- End-to-end profitable execution: discovery, state, routing, simulation,
  assessment, revalidation, transaction build, and submission.
- Restart and operator safety: startup, warmup, metrics, TUI/log ownership,
  shutdown, and persistent caches.
- Runtime correctness under chain/RPC stress: HyperSync pagination, rollback,
  watcher shard merge, RPC retries, endpoint selection, gas policy, and DB
  cache consistency.
- Performance without correctness loss: topology refresh, cycle enumeration,
  worker IPC, route-cache persistence, and repeated RPC/log work.
- Audit-pack quality: questions should mention concrete owner files/functions,
  expected invariants, and verification commands.
