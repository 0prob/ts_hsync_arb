# Discovery Repair And Bot Optimization Scope

This query suite is intended to diagnose and repair discovery first, then optimize the bot only after the discovered pool universe, metadata, live state, and routing graph are trustworthy.

Primary audit rules:

- Treat discovery as a coverage and correctness problem before treating it as a throughput problem.
- Verify every protocol and factory path independently: V2, V3, Balancer, Curve stable, Curve crypto, listed factories, removals, metadata enrichment, and rediscovery.
- Follow discovered pools through registry persistence, state warmup/hydration, topology admission, route enumeration, simulation, profitability assessment, and execution.
- Rank optimizations by impact on executable profitable opportunities, not by local microbenchmarks alone.
- Prefer changes that improve correctness, observability, and restart/reorg safety before increasing concurrency or scan rate.
