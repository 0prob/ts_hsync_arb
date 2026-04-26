# Discovery Repair And Bot Optimization Graphify Run

- run_id: 20260426T013645Z
- focus_path: src/discovery
- update_path: .
- query_budget: 200
- scope: /home/x/arb/t/graphify-out/discovery-bot-runs/20260426T013645Z/SCOPE.md

==> graphify update .
Re-extracting code files in . (no LLM needed)...
  AST extraction: 100/150 files (66%)
  AST extraction: 150/150 files (100%)
[graphify watch] Rebuilt: 951 nodes, 2209 edges, 30 communities
[graphify watch] graph.json, graph.html and GRAPH_REPORT.md updated in graphify-out
Code graph updated. For doc/paper/image changes run /graphify --update in your AI assistant.

==> graphify query Inventory\ the\ entire\ discovery\ system\ across\ runner\ startup\,\ background\ discovery\,\ src/discovery/discover.ts\,\ protocol\ catalogs\,\ factory\ enumerators\,\ HyperSync\ query\ construction\,\ metadata\ enrichment\,\ registry\ writes\,\ checkpointing\,\ rollback\ guards\,\ removals\,\ hydration\,\ and\ topology\ refresh.\ Classify\ each\ owner\ by\ responsibility\ and\ identify\ duplicated\ or\ unclear\ ownership. --budget 200
NODE .get() [src=src/db/registry_meta_cache.ts loc=L46 community=1]
NODE get() [src=scripts/test_hypersync_paginate.ts loc=L50 community=1]
NODE .get() [src=src/db/sqlite.ts loc=L27 community=1]
NODE runner.ts [src=runner.ts loc=L1 community=0]
NODE watcher.ts [src=src/state/watcher.ts loc=L1 community=2]
NODE finder.ts [src=src/routing/finder.ts loc=L1 community=10]
NODE pool_record.ts [src=src/util/pool_record.ts loc=L1 community=8]
NODE discover.ts [src=src/discovery/discover.ts loc=L1 community=3]
NODE index.ts [src=src/config/index.ts loc=L1 community=5]
NODE log() [src=runner.ts loc=L240
... (truncated to ~200 token budget)

==> graphify query Trace\ every\ path\ that\ can\ add\,\ update\,\ reactivate\,\ disable\,\ or\ remove\ a\ pool.\ Include\ initial\ discovery\,\ background\ discovery\,\ listed-factory\ discovery\,\ Curve\ removals\,\ reorg\ rollback\,\ quiet-pool\ sweep\,\ discovery\ hydration\,\ registry\ batch\ upserts\,\ topology\ admission\,\ and\ route\ cache\ invalidation.\ Identify\ state\ transitions\ that\ are\ not\ explicit\ or\ observable\ enough. --budget 200
NODE runner.ts [src=runner.ts loc=L1 community=0]
NODE registry_pools.ts [src=src/db/registry_pools.ts loc=L1 community=4]
NODE watcher.ts [src=src/state/watcher.ts loc=L1 community=2]
NODE finder.ts [src=src/routing/finder.ts loc=L1 community=10]
NODE pool_record.ts [src=src/util/pool_record.ts loc=L1 community=8]
NODE registry_codec.ts [src=src/db/registry_codec.ts loc=L1 community=4]
NODE watcher_state_ops.ts [src=src/state/watcher_state_ops.ts loc=L1 community=2]
NODE graph.ts [src=src/routing/graph.ts loc=L1 community=8]
NODE assessment.ts [src=src/arb/assessment.ts loc=L1 community=0]
NO
... (truncated to ~200 token budget)

==> graphify query Map\ the\ source-of-truth\ chain\ for\ discovered\ pools:\ factory\ events\,\ listed\ factory\ calls\,\ contract\ catalog\,\ pool\ metadata\,\ registry\ rows\,\ state\ cache\ entries\,\ topology\ edges\,\ route\ cache\ entries\,\ and\ TUI/operator\ views.\ Identify\ where\ the\ same\ concept\ is\ represented\ differently\ or\ can\ drift. --budget 200
NODE .get() [src=src/db/registry_meta_cache.ts loc=L46 community=1]
NODE runner.ts [src=runner.ts loc=L1 community=0]
NODE RegistryService [src=src/db/registry.ts loc=L72 community=3]
NODE registry_pools.ts [src=src/db/registry_pools.ts loc=L1 community=4]
NODE watcher.ts [src=src/state/watcher.ts loc=L1 community=2]
NODE finder.ts [src=src/routing/finder.ts loc=L1 community=10]
NODE pool_record.ts [src=src/util/pool_record.ts loc=L1 community=8]
NODE discover.ts [src=src/discovery/discover.ts loc=L1 community=3]
NODE watcher_state_ops.ts [src=src/state/watcher_state_ops.ts loc=L1 community=2]
... (truncated to ~200 token budget)

==> graphify query Audit\ discovery\ coverage\ protocol\ by\ protocol:\ Uniswap\ V2\,\ Uniswap\ V3\,\ Balancer\,\ Curve\ stable\,\ Curve\ crypto\,\ legacy\ Curve\ factories\,\ listed\ Curve\ factories\,\ and\ pool\ removals.\ For\ each\ protocol\,\ list\ factory\ sources\,\ event\ signatures\,\ block\ start\ logic\,\ metadata\ extraction\,\ token\ enrichment\,\ state\ hydration\,\ and\ likely\ under-coverage\ risks. --budget 200
NODE .get() [src=src/db/registry_meta_cache.ts loc=L46 community=1]
NODE .get() [src=src/db/sqlite.ts loc=L27 community=1]
NODE get() [src=scripts/test_hypersync_paginate.ts loc=L50 community=1]
NODE runner.ts [src=runner.ts loc=L1 community=0]
NODE RegistryService [src=src/db/registry.ts loc=L72 community=3]
NODE watcher.ts [src=src/state/watcher.ts loc=L1 community=2]
NODE registry_pools.ts [src=src/db/registry_pools.ts loc=L1 community=4]
NODE StateWatcher [src=src/state/watcher.ts loc=L491 community=2]
NODE discover.ts [src=src/discovery/discover.ts loc=L1 community=3]
NODE index.ts [src=s
... (truncated to ~200 token budget)

==> graphify query Trace\ factory\ and\ contract\ catalog\ usage\ across\ src/protocols\,\ discovery\,\ registry\ metadata\,\ and\ tests.\ Identify\ stale\ addresses\,\ missing\ factory\ variants\,\ wrong\ protocol\ labels\,\ duplicate\ catalog\ entries\,\ chain-specific\ assumptions\,\ and\ places\ where\ a\ new\ factory\ would\ need\ edits\ in\ multiple\ files. --budget 200
NODE .get() [src=src/db/registry_meta_cache.ts loc=L46 community=1]
NODE .get() [src=src/db/sqlite.ts loc=L27 community=1]
NODE get() [src=scripts/test_hypersync_paginate.ts loc=L50 community=1]
NODE runner.ts [src=runner.ts loc=L1 community=0]
NODE watcher.ts [src=src/state/watcher.ts loc=L1 community=2]
NODE pool_record.ts [src=src/util/pool_record.ts loc=L1 community=8]
NODE discover.ts [src=src/discovery/discover.ts loc=L1 community=3]
NODE index.ts [src=src/config/index.ts loc=L1 community=5]
NODE log() [src=runner.ts loc=L240 community=10]
NODE watcher_state_ops.ts [src=src/state/watcher
... (truncated to ~200 token budget)

==> graphify query Audit\ Curve\ discovery\ specifically.\ Follow\ stable\ and\ crypto\ factories\,\ listed-factory\ enumeration\,\ get_coins/getPoolCount-style\ calls\,\ removals\,\ metadataFactoryIndex\,\ protocol\ normalization\,\ and\ state\ support.\ Identify\ why\ Curve\ coverage\ can\ lag\ other\ protocols\ and\ what\ repair\ should\ be\ prioritized. --budget 200
NODE .get() [src=src/db/registry_meta_cache.ts loc=L46 community=1]
NODE .get() [src=src/db/sqlite.ts loc=L27 community=1]
NODE get() [src=scripts/test_hypersync_paginate.ts loc=L50 community=1]
NODE runner.ts [src=runner.ts loc=L1 community=0]
NODE watcher.ts [src=src/state/watcher.ts loc=L1 community=2]
NODE finder.ts [src=src/routing/finder.ts loc=L1 community=10]
NODE StateWatcher [src=src/state/watcher.ts loc=L491 community=2]
NODE pool_record.ts [src=src/util/pool_record.ts loc=L1 community=8]
NODE index.ts [src=src/config/index.ts loc=L1 community=5]
NODE watcher_state_ops.ts [src=src/s
... (truncated to ~200 token budget)

==> graphify query Audit\ Balancer\ discovery\ and\ state\ readiness.\ Trace\ pool\ discovery\,\ poolId\ handling\,\ token\ list\ enrichment\,\ state\ normalization\,\ liquidity\ validation\,\ topology\ admission\,\ and\ execution\ support.\ Identify\ coverage\ gaps\ and\ places\ where\ a\ discovered\ Balancer\ pool\ never\ becomes\ routeable. --budget 200
NODE .get() [src=src/db/registry_meta_cache.ts loc=L46 community=1]
NODE get() [src=scripts/test_hypersync_paginate.ts loc=L50 community=1]
NODE .get() [src=src/db/sqlite.ts loc=L27 community=1]
NODE runner.ts [src=runner.ts loc=L1 community=0]
NODE watcher.ts [src=src/state/watcher.ts loc=L1 community=2]
NODE StateWatcher [src=src/state/watcher.ts loc=L491 community=2]
NODE pool_record.ts [src=src/util/pool_record.ts loc=L1 community=8]
NODE index.ts [src=src/config/index.ts loc=L1 community=5]
NODE watcher_state_ops.ts [src=src/state/watcher_state_ops.ts loc=L1 community=2]
NODE normalizer.t
... (truncated to ~200 token budget)

==> graphify query Audit\ V2\ and\ V3\ discovery\ for\ correctness\ and\ completeness.\ Include\ factory\ event\ signatures\,\ topic\ filters\,\ fee\ metadata\,\ token\ order\,\ tick\ spacing\,\ start\ block\ defaults\,\ checkpoints\,\ token\ metadata\ hydration\,\ and\ warmup\ handoff.\ Identify\ conditions\ where\ pools\ are\ discovered\ but\ unusable\ or\ missing\ from\ routing. --budget 200
NODE .get() [src=src/db/registry_meta_cache.ts loc=L46 community=1]
NODE get() [src=scripts/test_hypersync_paginate.ts loc=L50 community=1]
NODE .get() [src=src/db/sqlite.ts loc=L27 community=1]
NODE finder.ts [src=src/routing/finder.ts loc=L1 community=10]
NODE watcher_state_ops.ts [src=src/state/watcher_state_ops.ts loc=L1 community=2]
NODE discoverCurveRemovals() [src=src/discovery/discover.ts loc=L293 community=1]
NODE .poll() [src=src/state/poll_univ3.ts loc=L56 community=1]
NODE normalizeEvmAddress() [src=src/util/pool_record.ts loc=L8 community=1]
NODE fetchAllLogsWithClient() [src=src/
... (truncated to ~200 token budget)

==> graphify query Trace\ discovery\ checkpoint\ math\ end\ to\ end:\ discoverStartIndex\,\ buildDiscoveryScanQuery\,\ fetchAllLogsWithClient\,\ discoveryCheckpointFromNextBlock\,\ protocol\ checkpoints\,\ global\ checkpoints\,\ rollback\ guard\ persistence\,\ and\ restart\ behavior.\ Identify\ off-by-one\,\ exclusive\ toBlock\,\ partial\ failure\,\ and\ moving-tip\ risks. --budget 200
NODE .get() [src=src/db/registry_meta_cache.ts loc=L46 community=1]
NODE .get() [src=src/db/sqlite.ts loc=L27 community=1]
NODE get() [src=scripts/test_hypersync_paginate.ts loc=L50 community=1]
NODE runner.ts [src=runner.ts loc=L1 community=0]
NODE watcher.ts [src=src/state/watcher.ts loc=L1 community=2]
NODE finder.ts [src=src/routing/finder.ts loc=L1 community=10]
NODE pool_record.ts [src=src/util/pool_record.ts loc=L1 community=8]
NODE watcher_state_ops.ts [src=src/state/watcher_state_ops.ts loc=L1 community=2]
NODE normalizer.ts [src=src/state/normalizer.ts loc=L1 community=7]
NODE graph.
... (truncated to ~200 token budget)

==> graphify query Audit\ background\ discovery\ scheduling\ and\ reconciliation.\ Follow\ pass\ runner\ scheduling\,\ discovery\ intervals\,\ reconcileDiscoveryResult\,\ trackBackgroundTask\,\ error\ backoff\,\ startup\ discovery\,\ quiet-pool\ sweep\,\ and\ hydration\ retry.\ Identify\ races\,\ duplicate\ work\,\ starvation\,\ and\ places\ where\ discovery\ failure\ silently\ degrades\ routing. --budget 200
NODE .get() [src=src/db/registry_meta_cache.ts loc=L46 community=1]
NODE get() [src=scripts/test_hypersync_paginate.ts loc=L50 community=1]
NODE .get() [src=src/db/sqlite.ts loc=L27 community=1]
NODE runner.ts [src=runner.ts loc=L1 community=0]
NODE watcher.ts [src=src/state/watcher.ts loc=L1 community=2]
NODE registry_pools.ts [src=src/db/registry_pools.ts loc=L1 community=4]
NODE finder.ts [src=src/routing/finder.ts loc=L1 community=10]
NODE pool_record.ts [src=src/util/pool_record.ts loc=L1 community=8]
NODE discover.ts [src=src/discovery/discover.ts loc=L1 community=3]
NODE index.ts [src=s
... (truncated to ~200 token budget)

==> graphify query Find\ every\ path\ where\ discovery\ can\ make\ progress\ in\ memory\ but\ fail\ to\ persist\ durable\ state\,\ or\ persist\ registry\ changes\ without\ refreshing\ in-memory\ caches\ and\ topology.\ Rank\ partial-commit\ and\ stale-cache\ risks\ by\ production\ impact. --budget 200
NODE .get() [src=src/db/registry_meta_cache.ts loc=L46 community=1]
NODE get() [src=scripts/test_hypersync_paginate.ts loc=L50 community=1]
NODE .get() [src=src/db/sqlite.ts loc=L27 community=1]
NODE runner.ts [src=runner.ts loc=L1 community=0]
NODE watcher.ts [src=src/state/watcher.ts loc=L1 community=2]
NODE finder.ts [src=src/routing/finder.ts loc=L1 community=10]
NODE pool_record.ts [src=src/util/pool_record.ts loc=L1 community=8]
NODE discover.ts [src=src/discovery/discover.ts loc=L1 community=3]
NODE index.ts [src=src/config/index.ts loc=L1 community=5]
NODE log() [src=runner.ts loc=L240
... (truncated to ~200 token budget)

==> graphify query Audit\ reorg\ and\ rollback\ interactions\ with\ discovery.\ Follow\ rollbackToBlock\,\ removed_block\ semantics\,\ rollbackWatcherState\,\ discovery\ checkpoints\,\ pool\ status\ transitions\,\ state\ history\,\ topology\ reload\,\ and\ route\ invalidation.\ Identify\ whether\ discovered\ pools\ and\ removed\ pools\ recover\ correctly\ after\ chain\ reorgs. --budget 200
NODE .get() [src=src/db/registry_meta_cache.ts loc=L46 community=1]
NODE get() [src=scripts/test_hypersync_paginate.ts loc=L50 community=1]
NODE .get() [src=src/db/sqlite.ts loc=L27 community=1]
NODE registry_pools.ts [src=src/db/registry_pools.ts loc=L1 community=4]
NODE watcher.ts [src=src/state/watcher.ts loc=L1 community=2]
NODE pool_record.ts [src=src/util/pool_record.ts loc=L1 community=8]
NODE watcher_state_ops.ts [src=src/state/watcher_state_ops.ts loc=L1 community=2]
NODE registry_codec.ts [src=src/db/registry_codec.ts loc=L1 community=4]
NODE normalizeProtocolKey() [src=src/protocols
... (truncated to ~200 token budget)

==> graphify query Trace\ metadata\ hydration\ from\ discovery\ output\ through\ registry\ upsert\,\ token\ metadata\,\ pool_record\ parsing\,\ state\ warmup\,\ quiet-pool\ hydration\,\ discovery\ hydration\,\ normalizer\,\ and\ route\ graph\ construction.\ Identify\ missing\ decimals\,\ malformed\ token\ lists\,\ fee\ defaults\,\ unsupported\ protocol\ states\,\ and\ hidden\ JSON\ parse\ risks. --budget 200
NODE .get() [src=src/db/registry_meta_cache.ts loc=L46 community=1]
NODE get() [src=scripts/test_hypersync_paginate.ts loc=L50 community=1]
NODE .get() [src=src/db/sqlite.ts loc=L27 community=1]
NODE RegistryService [src=src/db/registry.ts loc=L72 community=3]
NODE watcher.ts [src=src/state/watcher.ts loc=L1 community=2]
NODE StateWatcher [src=src/state/watcher.ts loc=L491 community=2]
NODE pool_record.ts [src=src/util/pool_record.ts loc=L1 community=8]
NODE watcher_state_ops.ts [src=src/state/watcher_state_ops.ts loc=L1 community=2]
NODE log() [src=runner.ts loc=L240 community=10]
NODE normal
... (truncated to ~200 token budget)

==> graphify query For\ every\ discovered\ pool\ class\,\ determine\ the\ path\ to\ becoming\ routeable.\ Include\ token\ metadata\,\ valid\ pool\ state\,\ topology\ edges\,\ supported\ simulation\,\ route\ enumeration\,\ price\ oracle\ support\,\ and\ execution\ encoding.\ Identify\ discovered\ pools\ that\ are\ likely\ dead-on-arrival\ and\ why. --budget 200
NODE .get() [src=src/db/registry_meta_cache.ts loc=L46 community=1]
NODE .get() [src=src/db/sqlite.ts loc=L27 community=1]
NODE get() [src=scripts/test_hypersync_paginate.ts loc=L50 community=1]
NODE runner.ts [src=runner.ts loc=L1 community=0]
NODE RegistryService [src=src/db/registry.ts loc=L72 community=3]
NODE registry_pools.ts [src=src/db/registry_pools.ts loc=L1 community=4]
NODE pool_record.ts [src=src/util/pool_record.ts loc=L1 community=8]
NODE discover.ts [src=src/discovery/discover.ts loc=L1 community=3]
NODE index.ts [src=src/config/index.ts loc=L1 community=5]
NODE registry_codec.
... (truncated to ~200 token budget)

==> graphify query Audit\ how\ invalid\ or\ incomplete\ discovered\ pools\ are\ surfaced.\ Follow\ debugInvalidPool\,\ warmup\ skip\ reasons\,\ topology\ removals\,\ discovery\ hydration\ logs\,\ registry\ status\,\ TUI\ summaries\,\ and\ metrics.\ Identify\ where\ operators\ cannot\ tell\ whether\ discovery\ is\ incomplete\,\ unsupported\,\ stale\,\ or\ simply\ waiting\ for\ hydration. --budget 200
NODE .get() [src=src/db/registry_meta_cache.ts loc=L46 community=1]
NODE get() [src=scripts/test_hypersync_paginate.ts loc=L50 community=1]
NODE .get() [src=src/db/sqlite.ts loc=L27 community=1]
NODE runner.ts [src=runner.ts loc=L1 community=0]
NODE RegistryService [src=src/db/registry.ts loc=L72 community=3]
NODE registry_pools.ts [src=src/db/registry_pools.ts loc=L1 community=4]
NODE watcher.ts [src=src/state/watcher.ts loc=L1 community=2]
NODE finder.ts [src=src/routing/finder.ts loc=L1 community=10]
NODE pool_record.ts [src=src/util/pool_record.ts loc=L1 community=8]
NODE discover.ts [src=
... (truncated to ~200 token budget)

==> graphify query Analyze\ state-cache\ seeding\ for\ new\ discoveries.\ Verify\ placeholder\ state\ shape\,\ timestamp\ handling\,\ token/protocol\ metadata\,\ later\ watcher\ updates\,\ warmup\ persistence\,\ and\ invalid-state\ classification.\ Identify\ whether\ newly\ discovered\ pools\ can\ poison\ routing\,\ hide\ opportunities\,\ or\ loop\ hydration\ forever. --budget 200
NODE .get() [src=src/db/registry_meta_cache.ts loc=L46 community=1]
NODE .get() [src=src/db/sqlite.ts loc=L27 community=1]
NODE get() [src=scripts/test_hypersync_paginate.ts loc=L50 community=1]
NODE runner.ts [src=runner.ts loc=L1 community=0]
NODE watcher.ts [src=src/state/watcher.ts loc=L1 community=2]
NODE finder.ts [src=src/routing/finder.ts loc=L1 community=10]
NODE pool_record.ts [src=src/util/pool_record.ts loc=L1 community=8]
NODE StateWatcher [src=src/state/watcher.ts loc=L491 community=2]
NODE index.ts [src=src/config/index.ts loc=L1 community=5]
NODE ._loop() [src=src/state/watcher
... (truncated to ~200 token budget)

==> graphify query Trace\ the\ handoff\ from\ discovery\ to\ topology\ and\ route\ enumeration:\ registry\ writes\,\ seedNewPoolsIntoStateCache\,\ buildGraph\,\ buildHubGraph\,\ topology\ cache\,\ refreshCycles\,\ enumerateCyclesDual\,\ route\ cache\ update\,\ and\ worker\ evaluation.\ Identify\ stale\ or\ missing\ invalidation\ that\ can\ leave\ new\ pools\ unused. --budget 200
NODE .get() [src=src/db/registry_meta_cache.ts loc=L46 community=1]
NODE get() [src=scripts/test_hypersync_paginate.ts loc=L50 community=1]
NODE .get() [src=src/db/sqlite.ts loc=L27 community=1]
NODE runner.ts [src=runner.ts loc=L1 community=0]
NODE registry_pools.ts [src=src/db/registry_pools.ts loc=L1 community=4]
NODE watcher.ts [src=src/state/watcher.ts loc=L1 community=2]
NODE finder.ts [src=src/routing/finder.ts loc=L1 community=10]
NODE pool_record.ts [src=src/util/pool_record.ts loc=L1 community=8]
NODE registry_codec.ts [src=src/db/registry_codec.ts loc=L1 community=4]
NODE watcher_st
... (truncated to ~200 token budget)

==> graphify query Audit\ route\ graph\ completeness\ after\ discovery.\ Identify\ whether\ all\ supported\ discovered\ pools\ get\ bidirectional\ edges\ when\ appropriate\,\ whether\ protocol\ support\ filters\ are\ correct\,\ whether\ token\ metadata\ gates\ are\ too\ strict\ or\ too\ loose\,\ and\ whether\ topology\ refresh\ cadence\ misses\ new\ opportunities. --budget 200
NODE .get() [src=src/db/registry_meta_cache.ts loc=L46 community=1]
NODE get() [src=scripts/test_hypersync_paginate.ts loc=L50 community=1]
NODE .get() [src=src/db/sqlite.ts loc=L27 community=1]
NODE runner.ts [src=runner.ts loc=L1 community=0]
NODE watcher.ts [src=src/state/watcher.ts loc=L1 community=2]
NODE finder.ts [src=src/routing/finder.ts loc=L1 community=10]
NODE pool_record.ts [src=src/util/pool_record.ts loc=L1 community=8]
NODE watcher_state_ops.ts [src=src/state/watcher_state_ops.ts loc=L1 community=2]
NODE normalizeProtocolKey() [src=src/protocols/classification.ts loc=L50 commun
... (truncated to ~200 token budget)

==> graphify query Find\ where\ discovery\ and\ routing\ disagree\ about\ protocol\ identity\,\ token\ ordering\,\ pool\ address\ normalization\,\ fee\ representation\,\ poolId\,\ and\ route\ support.\ Rank\ mismatches\ that\ can\ cause\ missed\ routes\,\ wrong\ simulation\,\ or\ wrong\ execution\ calldata. --budget 200
NODE .get() [src=src/db/registry_meta_cache.ts loc=L46 community=1]
NODE .get() [src=src/db/sqlite.ts loc=L27 community=1]
NODE get() [src=scripts/test_hypersync_paginate.ts loc=L50 community=1]
NODE runner.ts [src=runner.ts loc=L1 community=0]
NODE watcher.ts [src=src/state/watcher.ts loc=L1 community=2]
NODE finder.ts [src=src/routing/finder.ts loc=L1 community=10]
NODE pool_record.ts [src=src/util/pool_record.ts loc=L1 community=8]
NODE discover.ts [src=src/discovery/discover.ts loc=L1 community=3]
NODE index.ts [src=src/config/index.ts loc=L1 community=5]
NODE log() [src=runner.ts loc=L240
... (truncated to ~200 token budget)

==> graphify query Trace\ newly\ discovered\ pools\ through\ route\ cache\ freshness\ and\ revalidation.\ Identify\ whether\ route\ cache\ entries\ are\ invalidated\,\ refreshed\,\ or\ admitted\ when\ discovery\ adds/removes\ pools\,\ when\ watcher\ updates\ state\,\ and\ when\ rollback\ removes\ state. --budget 200
NODE .get() [src=src/db/registry_meta_cache.ts loc=L46 community=1]
NODE .get() [src=src/db/sqlite.ts loc=L27 community=1]
NODE get() [src=scripts/test_hypersync_paginate.ts loc=L50 community=1]
NODE runner.ts [src=runner.ts loc=L1 community=0]
NODE watcher.ts [src=src/state/watcher.ts loc=L1 community=2]
NODE registry_pools.ts [src=src/db/registry_pools.ts loc=L1 community=4]
NODE finder.ts [src=src/routing/finder.ts loc=L1 community=10]
NODE pool_record.ts [src=src/util/pool_record.ts loc=L1 community=8]
NODE registry_codec.ts [src=src/db/registry_codec.ts loc=L1 community=4]
NODE watcher_st
... (truncated to ~200 token budget)

==> graphify query Trace\ the\ full\ opportunity\ pipeline\ after\ discovery\ repair:\ findArbs\,\ route\ enumeration\,\ candidate\ selection\,\ price\ oracle\,\ gas\ estimate\ cache\,\ optimizeInputAmount\,\ simulateRoute\,\ assessRouteResult\,\ revalidation\,\ buildArbTx\,\ and\ sendTx.\ Identify\ where\ better\ discovery\ increases\ load\ and\ which\ downstream\ gates\ will\ become\ the\ next\ bottleneck. --budget 200
NODE runner.ts [src=runner.ts loc=L1 community=0]
NODE watcher.ts [src=src/state/watcher.ts loc=L1 community=2]
NODE finder.ts [src=src/routing/finder.ts loc=L1 community=10]
NODE pool_record.ts [src=src/util/pool_record.ts loc=L1 community=8]
NODE discover.ts [src=src/discovery/discover.ts loc=L1 community=3]
NODE index.ts [src=src/config/index.ts loc=L1 community=5]
NODE log() [src=runner.ts loc=L240 community=10]
NODE gas.ts [src=src/execution/gas.ts loc=L1 community=9]
NODE normalizer.ts [src=src/state/normalizer.ts loc=L1 community=7]
NODE graph.ts [src=src/routing/graph.ts loc=L1 communi
... (truncated to ~200 token budget)

==> graphify query Audit\ false\ negatives\ in\ the\ profitability\ pipeline.\ Focus\ on\ discovered\ pools\ that\ are\ routeable\ but\ discarded\ by\ pruneByLiquidity\,\ edgeSpotLogWeight\,\ candidate\ limits\,\ stale\ pricing\,\ gas\ assumptions\,\ optimization\ budget\,\ route\ cache\ freshness\,\ or\ unsupported\ execution\ metadata. --budget 200
NODE .get() [src=src/db/registry_meta_cache.ts loc=L46 community=1]
NODE .get() [src=src/db/sqlite.ts loc=L27 community=1]
NODE get() [src=scripts/test_hypersync_paginate.ts loc=L50 community=1]
NODE runner.ts [src=runner.ts loc=L1 community=0]
NODE registry_pools.ts [src=src/db/registry_pools.ts loc=L1 community=4]
NODE watcher.ts [src=src/state/watcher.ts loc=L1 community=2]
NODE finder.ts [src=src/routing/finder.ts loc=L1 community=10]
NODE pool_record.ts [src=src/util/pool_record.ts loc=L1 community=8]
NODE discover.ts [src=src/discovery/discover.ts loc=L1 community=3]
NODE index.ts [src=s
... (truncated to ~200 token budget)

==> graphify query Audit\ false\ positives\ after\ broadening\ discovery.\ Identify\ how\ low-liquidity\ pools\,\ stale\ states\,\ unsupported\ protocols\,\ bad\ token\ metadata\,\ route\ cycles\ with\ poor\ price\ oracle\ coverage\,\ and\ simulation\ approximations\ can\ waste\ CPU\ or\ create\ unsafe\ execution\ candidates. --budget 200
NODE .get() [src=src/db/registry_meta_cache.ts loc=L46 community=1]
NODE get() [src=scripts/test_hypersync_paginate.ts loc=L50 community=1]
NODE .get() [src=src/db/sqlite.ts loc=L27 community=1]
NODE runner.ts [src=runner.ts loc=L1 community=0]
NODE watcher.ts [src=src/state/watcher.ts loc=L1 community=2]
NODE finder.ts [src=src/routing/finder.ts loc=L1 community=10]
NODE pool_record.ts [src=src/util/pool_record.ts loc=L1 community=8]
NODE discover.ts [src=src/discovery/discover.ts loc=L1 community=3]
NODE index.ts [src=src/config/index.ts loc=L1 community=5]
NODE log() [src=runner.ts loc=L240
... (truncated to ~200 token budget)

==> graphify query Rank\ the\ highest-leverage\ profitability\ improvements\ that\ depend\ on\ discovery\ being\ correct.\ Include\ candidate\ shortlist\ policy\,\ second-chance\ optimization\,\ stale-price\ rejection\,\ gas-denominated\ profit\ checks\,\ triangular\ paths\,\ worker\ chunking\,\ and\ execution\ revalidation. --budget 200
NODE .get() [src=src/db/registry_meta_cache.ts loc=L46 community=1]
NODE .get() [src=src/db/sqlite.ts loc=L27 community=1]
NODE get() [src=scripts/test_hypersync_paginate.ts loc=L50 community=1]
NODE runner.ts [src=runner.ts loc=L1 community=0]
NODE watcher.ts [src=src/state/watcher.ts loc=L1 community=2]
NODE finder.ts [src=src/routing/finder.ts loc=L1 community=10]
NODE pool_record.ts [src=src/util/pool_record.ts loc=L1 community=8]
NODE discover.ts [src=src/discovery/discover.ts loc=L1 community=3]
NODE index.ts [src=src/config/index.ts loc=L1 community=5]
NODE log() [src=runner.ts loc=L240
... (truncated to ~200 token budget)

==> graphify query Trace\ the\ main\ bot\ pass\ lifecycle\ across\ startup\,\ initial\ discovery\,\ warmup\,\ refreshCycles\,\ runPass\,\ background\ discovery\,\ quiet-pool\ sweep\,\ stale\ oracle\ refresh\,\ opportunity\ search\,\ execution\ dispatch\,\ heartbeat\,\ metrics\,\ TUI\ updates\,\ and\ shutdown.\ Identify\ serial\ bottlenecks\ and\ unnecessary\ repeated\ work. --budget 200
NODE .get() [src=src/db/registry_meta_cache.ts loc=L46 community=1]
NODE get() [src=scripts/test_hypersync_paginate.ts loc=L50 community=1]
NODE .get() [src=src/db/sqlite.ts loc=L27 community=1]
NODE runner.ts [src=runner.ts loc=L1 community=0]
NODE watcher.ts [src=src/state/watcher.ts loc=L1 community=2]
NODE finder.ts [src=src/routing/finder.ts loc=L1 community=10]
NODE pool_record.ts [src=src/util/pool_record.ts loc=L1 community=8]
NODE watcher_state_ops.ts [src=src/state/watcher_state_ops.ts loc=L1 community=2]
NODE normalizer.ts [src=src/state/normalizer.ts loc=L1 community=7]
NODE graph.
... (truncated to ~200 token budget)

==> graphify query Identify\ CPU\ hotspots\ that\ will\ grow\ with\ better\ discovery\ coverage.\ Focus\ on\ graph\ building\,\ route\ enumeration\,\ path\ dedupe\,\ worker\ serialization\,\ simulation\ math\,\ optimization\ loops\,\ route\ revalidation\,\ price\ lookups\,\ and\ route\ cache\ maintenance.\ Rank\ by\ likely\ impact\ and\ ease\ of\ repair. --budget 200
NODE .get() [src=src/db/registry_meta_cache.ts loc=L46 community=1]
NODE get() [src=scripts/test_hypersync_paginate.ts loc=L50 community=1]
NODE .get() [src=src/db/sqlite.ts loc=L27 community=1]
NODE runner.ts [src=runner.ts loc=L1 community=0]
NODE registry_pools.ts [src=src/db/registry_pools.ts loc=L1 community=4]
NODE watcher.ts [src=src/state/watcher.ts loc=L1 community=2]
NODE finder.ts [src=src/routing/finder.ts loc=L1 community=10]
NODE pool_record.ts [src=src/util/pool_record.ts loc=L1 community=8]
NODE watcher_state_ops.ts [src=src/state/watcher_state_ops.ts loc=L1 community=2]
NODE r
... (truncated to ~200 token budget)

==> graphify query Identify\ IO\ and\ RPC\ hotspots\ that\ will\ grow\ with\ better\ discovery\ coverage.\ Focus\ on\ registry\ reads/writes\,\ token\ metadata\ hydration\,\ pool\ state\ warmup\,\ HyperRPC\ multicalls\,\ gas\ and\ fee\ reads\,\ private\ tx\ submission\,\ receipt\ polling\,\ and\ metrics/log\ output. --budget 200
NODE .get() [src=src/db/registry_meta_cache.ts loc=L46 community=1]
NODE .get() [src=src/db/sqlite.ts loc=L27 community=1]
NODE get() [src=scripts/test_hypersync_paginate.ts loc=L50 community=1]
NODE RegistryService [src=src/db/registry.ts loc=L72 community=3]
NODE watcher.ts [src=src/state/watcher.ts loc=L1 community=2]
NODE pool_record.ts [src=src/util/pool_record.ts loc=L1 community=8]
NODE watcher_state_ops.ts [src=src/state/watcher_state_ops.ts loc=L1 community=2]
NODE log() [src=runner.ts loc=L240 community=10]
NODE normalizeProtocolKey() [src=src/protocols/classification.ts loc=L50 comm
... (truncated to ~200 token budget)

==> graphify query Audit\ concurrency\ and\ backpressure\ across\ discovery\,\ warmup\,\ quiet-pool\ sweep\,\ worker\ pool\ evaluation\,\ RPC\ manager\,\ pass\ runner\,\ and\ execution.\ Identify\ where\ increasing\ concurrency\ would\ improve\ throughput\ and\ where\ it\ would\ create\ stale\ state\,\ rate-limit\,\ or\ CPU\ contention\ problems. --budget 200
NODE .get() [src=src/db/registry_meta_cache.ts loc=L46 community=1]
NODE get() [src=scripts/test_hypersync_paginate.ts loc=L50 community=1]
NODE .get() [src=src/db/sqlite.ts loc=L27 community=1]
NODE runner.ts [src=runner.ts loc=L1 community=0]
NODE watcher.ts [src=src/state/watcher.ts loc=L1 community=2]
NODE finder.ts [src=src/routing/finder.ts loc=L1 community=10]
NODE pool_record.ts [src=src/util/pool_record.ts loc=L1 community=8]
NODE watcher_state_ops.ts [src=src/state/watcher_state_ops.ts loc=L1 community=2]
NODE graph.ts [src=src/routing/graph.ts loc=L1 community=8]
NODE normalizer.ts 
... (truncated to ~200 token budget)

==> graphify query Analyze\ cache\ ownership\ and\ invalidation\ for\ bot\ optimization:\ stateCache\,\ RouteCache\,\ topology\ cache\,\ gas\ estimate\ cache\,\ registry\ meta\ cache\,\ token\ metadata\,\ worker\ serialized\ state\,\ and\ candidate/revalidation\ caches.\ Identify\ caches\ that\ should\ become\ versioned\,\ write-through\,\ or\ explicitly\ scoped\ to\ a\ pass. --budget 200
NODE .get() [src=src/db/registry_meta_cache.ts loc=L46 community=1]
NODE .get() [src=src/db/sqlite.ts loc=L27 community=1]
NODE get() [src=scripts/test_hypersync_paginate.ts loc=L50 community=1]
NODE runner.ts [src=runner.ts loc=L1 community=0]
NODE RegistryService [src=src/db/registry.ts loc=L72 community=3]
NODE registry_pools.ts [src=src/db/registry_pools.ts loc=L1 community=4]
NODE finder.ts [src=src/routing/finder.ts loc=L1 community=10]
NODE pool_record.ts [src=src/util/pool_record.ts loc=L1 community=8]
NODE discover.ts [src=src/discovery/discover.ts loc=L1 community=3]
NODE watcher_sta
... (truncated to ~200 token budget)

==> graphify query Find\ logging\ and\ metrics\ changes\ needed\ before\ optimizing\ the\ bot.\ Identify\ which\ discovery\,\ hydration\,\ topology\,\ route\ evaluation\,\ profitability\,\ execution\,\ and\ backoff\ counters/timers\ would\ make\ optimization\ measurable\ and\ prevent\ regressions. --budget 200
NODE .get() [src=src/db/registry_meta_cache.ts loc=L46 community=1]
NODE get() [src=scripts/test_hypersync_paginate.ts loc=L50 community=1]
NODE .get() [src=src/db/sqlite.ts loc=L27 community=1]
NODE runner.ts [src=runner.ts loc=L1 community=0]
NODE finder.ts [src=src/routing/finder.ts loc=L1 community=10]
NODE graph.ts [src=src/routing/graph.ts loc=L1 community=8]
NODE worker_pool.ts [src=src/routing/worker_pool.ts loc=L1 community=6]
NODE enumerate_cycles.ts [src=src/routing/enumerate_cycles.ts loc=L1 community=8]
NODE find4HopPathsBidirectional() [src=src/routing/finder.ts loc=L409 communit
... (truncated to ~200 token budget)

==> graphify query List\ existing\ tests\ that\ protect\ discovery\,\ metadata\,\ checkpointing\,\ reorg\ rollback\,\ watcher\ state\,\ route\ enumeration\,\ profitability\,\ execution\ hot\ path\,\ and\ runtime\ orchestration.\ For\ each\,\ explain\ what\ it\ proves\ and\ what\ important\ behavior\ remains\ untested. --budget 200
NODE .get() [src=src/db/registry_meta_cache.ts loc=L46 community=1]
NODE .get() [src=src/db/sqlite.ts loc=L27 community=1]
NODE get() [src=scripts/test_hypersync_paginate.ts loc=L50 community=1]
NODE runner.ts [src=runner.ts loc=L1 community=0]
NODE RegistryService [src=src/db/registry.ts loc=L72 community=3]
NODE watcher.ts [src=src/state/watcher.ts loc=L1 community=2]
NODE finder.ts [src=src/routing/finder.ts loc=L1 community=10]
NODE StateWatcher [src=src/state/watcher.ts loc=L491 community=2]
NODE pool_record.ts [src=src/util/pool_record.ts loc=L1 community=8]
NODE ._loop() [src=src/state/
... (truncated to ~200 token budget)

==> graphify query Design\ the\ ideal\ test\ matrix\ for\ repairing\ discovery\ before\ optimizing\ the\ bot.\ Include\ protocol-specific\ discovery\ fixtures\,\ checkpoint\ edge\ cases\,\ listed-factory\ coverage\,\ removed\ pools\,\ metadata\ parsing\,\ hydration\ retry\,\ topology\ admission\,\ routeability\,\ and\ reorg\ recovery. --budget 200
NODE .get() [src=src/db/registry_meta_cache.ts loc=L46 community=1]
NODE .get() [src=src/db/sqlite.ts loc=L27 community=1]
NODE get() [src=scripts/test_hypersync_paginate.ts loc=L50 community=1]
NODE runner.ts [src=runner.ts loc=L1 community=0]
NODE watcher.ts [src=src/state/watcher.ts loc=L1 community=2]
NODE registry_pools.ts [src=src/db/registry_pools.ts loc=L1 community=4]
NODE finder.ts [src=src/routing/finder.ts loc=L1 community=10]
NODE pool_record.ts [src=src/util/pool_record.ts loc=L1 community=8]
NODE discover.ts [src=src/discovery/discover.ts loc=L1 community=3]
NODE index.ts [src=s
... (truncated to ~200 token budget)

==> graphify query Design\ the\ ideal\ benchmark\ and\ profiling\ plan\ after\ discovery\ repair.\ Include\ graph\ size\,\ pool\ count\,\ route\ count\,\ pass\ latency\,\ worker\ CPU\,\ serialization\ volume\,\ registry\ query\ counts\,\ RPC\ request\ counts\,\ opportunity\ throughput\,\ and\ execution\ decision\ latency. --budget 200
NODE .get() [src=src/db/registry_meta_cache.ts loc=L46 community=1]
NODE get() [src=scripts/test_hypersync_paginate.ts loc=L50 community=1]
NODE .get() [src=src/db/sqlite.ts loc=L27 community=1]
NODE runner.ts [src=runner.ts loc=L1 community=0]
NODE watcher.ts [src=src/state/watcher.ts loc=L1 community=2]
NODE pool_record.ts [src=src/util/pool_record.ts loc=L1 community=8]
NODE index.ts [src=src/config/index.ts loc=L1 community=5]
NODE watcher_state_ops.ts [src=src/state/watcher_state_ops.ts loc=L1 community=2]
NODE normalizer.ts [src=src/state/normalizer.ts loc=L1 community=7]
NODE WorkerPool
... (truncated to ~200 token budget)

==> graphify query Design\ a\ live\ verification\ checklist\ for\ Polygon\ discovery\ repair:\ clean\ env\ validation\,\ current\ height\ capture\,\ bounded\ protocol\ discovery\,\ Curve\ listed-factory\ spot\ checks\,\ registry\ pool-count\ deltas\,\ hydration\ success\,\ topology\ edge\ deltas\,\ route\ count\ deltas\,\ and\ profitable-opportunity\ dry\ run. --budget 200
NODE .get() [src=src/db/registry_meta_cache.ts loc=L46 community=1]
NODE .get() [src=src/db/sqlite.ts loc=L27 community=1]
NODE get() [src=scripts/test_hypersync_paginate.ts loc=L50 community=1]
NODE RegistryService [src=src/db/registry.ts loc=L72 community=3]
NODE watcher.ts [src=src/state/watcher.ts loc=L1 community=2]
NODE registry_pools.ts [src=src/db/registry_pools.ts loc=L1 community=4]
NODE pool_record.ts [src=src/util/pool_record.ts loc=L1 community=8]
NODE discover.ts [src=src/discovery/discover.ts loc=L1 community=3]
NODE log() [src=runner.ts loc=L240 community=10]
NODE registry_code
... (truncated to ~200 token budget)

==> graphify query Rank\ the\ top\ 20\ concrete\ discovery\ bug\ risks.\ Prioritize\ under-coverage\,\ stale\ factory\ sources\,\ checkpoint\ mistakes\,\ missed\ removals\,\ metadata\ corruption\,\ hydration\ dead\ ends\,\ stale\ topology\,\ restart\ drift\,\ and\ reorg\ gaps.\ For\ each\,\ name\ owner\ files\,\ expected\ symptom\,\ repair\ approach\,\ and\ verification. --budget 200
NODE .get() [src=src/db/registry_meta_cache.ts loc=L46 community=1]
NODE .get() [src=src/db/sqlite.ts loc=L27 community=1]
NODE get() [src=scripts/test_hypersync_paginate.ts loc=L50 community=1]
NODE finder.ts [src=src/routing/finder.ts loc=L1 community=10]
NODE watcher_state_ops.ts [src=src/state/watcher_state_ops.ts loc=L1 community=2]
NODE discoverCurveRemovals() [src=src/discovery/discover.ts loc=L293 community=1]
NODE .poll() [src=src/state/poll_univ3.ts loc=L56 community=1]
NODE normalizeEvmAddress() [src=src/util/pool_record.ts loc=L8 community=1]
NODE fetchAllLogsWithClient() [src=src/
... (truncated to ~200 token budget)

==> graphify query Rank\ the\ top\ 20\ bot\ optimization\ opportunities\ that\ should\ come\ after\ discovery\ repair.\ Prioritize\ changes\ by\ executable-profit\ impact\,\ runtime\ safety\,\ observability\,\ and\ implementation\ cost.\ Separate\ correctness\ optimizations\ from\ pure\ throughput\ optimizations. --budget 200
NODE .get() [src=src/db/registry_meta_cache.ts loc=L46 community=1]
NODE get() [src=scripts/test_hypersync_paginate.ts loc=L50 community=1]
NODE .get() [src=src/db/sqlite.ts loc=L27 community=1]
NODE runner.ts [src=runner.ts loc=L1 community=0]
NODE finder.ts [src=src/routing/finder.ts loc=L1 community=10]
NODE discover.ts [src=src/discovery/discover.ts loc=L1 community=3]
NODE index.ts [src=src/config/index.ts loc=L1 community=5]
NODE log() [src=runner.ts loc=L240 community=10]
NODE graph.ts [src=src/routing/graph.ts loc=L1 community=8]
NODE discoverProtocol() [src=src/discovery/discover.ts l
... (truncated to ~200 token budget)

==> graphify query Produce\ an\ ordered\ implementation\ roadmap:\ phase\ 1\ discovery\ correctness\,\ phase\ 2\ discovery\ observability\ and\ live\ verification\,\ phase\ 3\ routeability\ and\ topology\ fixes\,\ phase\ 4\ profitability\ throughput\,\ phase\ 5\ runtime\ and\ execution\ optimization.\ Include\ owner\ files\ and\ validation\ commands\ for\ each\ phase. --budget 200
NODE .get() [src=src/db/registry_meta_cache.ts loc=L46 community=1]
NODE .get() [src=src/db/sqlite.ts loc=L27 community=1]
NODE get() [src=scripts/test_hypersync_paginate.ts loc=L50 community=1]
NODE watcher.ts [src=src/state/watcher.ts loc=L1 community=2]
NODE finder.ts [src=src/routing/finder.ts loc=L1 community=10]
NODE pool_record.ts [src=src/util/pool_record.ts loc=L1 community=8]
NODE watcher_state_ops.ts [src=src/state/watcher_state_ops.ts loc=L1 community=2]
NODE normalizer.ts [src=src/state/normalizer.ts loc=L1 community=7]
NODE discoverCurveRemovals() [src=src/discovery/discover.ts l
... (truncated to ~200 token budget)

==> graphify query If\ only\ one\ week\ of\ work\ is\ available\,\ what\ is\ the\ highest-return\ sequence\ to\ repair\ discovery\ and\ optimize\ the\ bot\?\ Use\ the\ graph\ to\ justify\ the\ ordering\ and\ explicitly\ call\ out\ dependencies\ that\ must\ not\ be\ skipped. --budget 200
NODE .get() [src=src/db/registry_meta_cache.ts loc=L46 community=1]
NODE .get() [src=src/db/sqlite.ts loc=L27 community=1]
NODE get() [src=scripts/test_hypersync_paginate.ts loc=L50 community=1]
NODE runner.ts [src=runner.ts loc=L1 community=0]
NODE watcher.ts [src=src/state/watcher.ts loc=L1 community=2]
NODE finder.ts [src=src/routing/finder.ts loc=L1 community=10]
NODE pool_record.ts [src=src/util/pool_record.ts loc=L1 community=8]
NODE discover.ts [src=src/discovery/discover.ts loc=L1 community=3]
NODE index.ts [src=src/config/index.ts loc=L1 community=5]
NODE log() [src=runner.ts loc=L240
... (truncated to ~200 token budget)

==> graphify path discoverPools\(\) RegistryService
Shortest path (3 hops):
  discoverPools() --contains [EXTRACTED]--> discover.ts --imports_from [EXTRACTED]--> registry.ts --contains [EXTRACTED]--> RegistryService

==> graphify path discoverProtocol\(\) buildDiscoveryScanQuery\(\)
Shortest path (1 hops):
  discoverProtocol() --calls [EXTRACTED]--> buildDiscoveryScanQuery()

==> graphify path buildDiscoveryScanQuery\(\) fetchAllLogsWithClient\(\)
Shortest path (3 hops):
  buildDiscoveryScanQuery() --contains [EXTRACTED]--> discover.ts --imports_from [EXTRACTED]--> paginate.ts --contains [EXTRACTED]--> fetchAllLogsWithClient()

==> graphify path discoverCurveListedFactory\(\) batchUpsertPools\(\)
Shortest path (1 hops):
  discoverCurveListedFactory() --calls [INFERRED]--> .batchUpsertPools()

==> graphify path discoverCurveRemovals\(\) rollbackToBlock\(\)
Shortest path (3 hops):
  discoverCurveRemovals() --calls [INFERRED]--> .batchRemovePools() --method [EXTRACTED]--> RegistryService --method [EXTRACTED]--> .rollbackToBlock()

==> graphify path batchUpsertPools\(\) seedNewPoolsIntoStateCache\(\)
Shortest path (5 hops):
  .batchUpsertPools() --calls [INFERRED]--> discoverProtocol() --calls [EXTRACTED]--> getDiscoveryQuerySpec() --calls [INFERRED]--> get() --calls [INFERRED]--> getPoolTokens() --calls [INFERRED]--> seedNewPoolsIntoStateCache()

==> graphify path seedNewPoolsIntoStateCache\(\) buildGraph\(\)
Shortest path (4 hops):
  seedNewPoolsIntoStateCache() --contains [EXTRACTED]--> discovery_refresh.ts --imports_from [EXTRACTED]--> runner.ts --imports_from [EXTRACTED]--> graph.ts --contains [EXTRACTED]--> buildGraph()

==> graphify path buildGraph\(\) enumerateCyclesDual\(\)
Shortest path (3 hops):
  buildGraph() --contains [EXTRACTED]--> graph.ts --imports_from [EXTRACTED]--> enumerate_cycles.ts --contains [EXTRACTED]--> enumerateCyclesDual()

==> graphify path discoverPools\(\) refreshCycles\(\)
Shortest path (3 hops):
  discoverPools() --contains [EXTRACTED]--> discover.ts --imports_from [EXTRACTED]--> runner.ts --contains [EXTRACTED]--> refreshCycles()

==> graphify path refreshCycles\(\) evaluatePathsParallel\(\)
Shortest path (3 hops):
  refreshCycles() --contains [EXTRACTED]--> runner.ts --imports_from [EXTRACTED]--> simulator.ts --contains [EXTRACTED]--> evaluatePathsParallel()

==> graphify path evaluatePathsParallel\(\) assessRouteResult\(\)
Shortest path (4 hops):
  evaluatePathsParallel() --contains [EXTRACTED]--> simulator.ts --imports_from [EXTRACTED]--> path_hops.ts --contains [EXTRACTED]--> getPathHopCount() --calls [INFERRED]--> assessRouteResult()

==> graphify path assessRouteResult\(\) buildArbTx\(\)
Shortest path (4 hops):
  assessRouteResult() --contains [EXTRACTED]--> assessment.ts --imports_from [EXTRACTED]--> runner.ts --imports_from [EXTRACTED]--> build_tx.ts --contains [EXTRACTED]--> buildArbTx()

==> graphify path createExecutionCoordinator\(\) buildArbTx\(\)
Shortest path (4 hops):
  createExecutionCoordinator() --contains [EXTRACTED]--> execution_coordinator.ts --imports_from [EXTRACTED]--> route_identity.ts --imports_from [EXTRACTED]--> build_tx.ts --contains [EXTRACTED]--> buildArbTx()

==> graphify path buildArbTx\(\) sendTx\(\)
Shortest path (4 hops):
  buildArbTx() --contains [EXTRACTED]--> build_tx.ts --imports_from [EXTRACTED]--> runner.ts --imports_from [EXTRACTED]--> send_tx.ts --contains [EXTRACTED]--> sendTx()

==> graphify path StateWatcher RouteCache
Shortest path (3 hops):
  StateWatcher --method [EXTRACTED]--> ._advanceEnrichmentEpoch() --calls [INFERRED]--> .clear() --method [EXTRACTED]--> RouteCache

==> graphify path rollbackToBlock\(\) refreshCycles\(\)
Shortest path (4 hops):
  .rollbackToBlock() --method [EXTRACTED]--> RegistryService --contains [EXTRACTED]--> registry.ts --imports_from [EXTRACTED]--> runner.ts --contains [EXTRACTED]--> refreshCycles()

==> graphify path PriceOracle assessRouteResult\(\)
Shortest path (4 hops):
  PriceOracle --contains [EXTRACTED]--> price_oracle.ts --imports_from [EXTRACTED]--> runner.ts --imports_from [EXTRACTED]--> assessment.ts --contains [EXTRACTED]--> assessRouteResult()

==> graphify path WorkerPool simulateRoute\(\)
Shortest path (3 hops):
  WorkerPool --contains [EXTRACTED]--> worker_pool.ts --imports_from [EXTRACTED]--> simulator.ts --contains [EXTRACTED]--> simulateRoute()

==> graphify path runPass discoverPools\(\)
Shortest path (3 hops):
  runPass() --contains [EXTRACTED]--> runner.ts --imports_from [EXTRACTED]--> discover.ts --contains [EXTRACTED]--> discoverPools()

==> graphify path runPass\(\) sendTx\(\)
Shortest path (3 hops):
  runPass() --contains [EXTRACTED]--> runner.ts --imports_from [EXTRACTED]--> send_tx.ts --contains [EXTRACTED]--> sendTx()

==> graphify explain discoverPools\(\)
Node: discoverPools()
  ID:        discover_discoverpools
  Source:    src/discovery/discover.ts L496
  Type:      code
  Community: 3
  Degree:    2

Connections (2):
  --> discover.ts [contains] [EXTRACTED]
  --> discoverPoolsWithDeps() [calls] [EXTRACTED]

==> graphify explain discoverPoolsWithDeps\(\)
Node: discoverPoolsWithDeps()
  ID:        discover_discoverpoolswithdeps
  Source:    src/discovery/discover.ts L385
  Type:      code
  Community: 3
  Degree:    13

Connections (13):
  --> discover.ts [contains] [EXTRACTED]
  --> log() [calls] [INFERRED]
  --> throttledMap() [calls] [INFERRED]
  --> getActivePoolCount() [calls] [INFERRED]
  --> getPoolCount() [calls] [INFERRED]
  --> setRollbackGuard() [calls] [INFERRED]
  --> .close() [calls] [INFERRED]
  --> rollbackToBlock() [calls] [INFERRED]
  --> .getActivePoolCount() [calls] [INFERRED]
  --> .setRollbackGuard() [calls] [INFERRED]
  --> .rollbackToBlock() [calls] [INFERRED]
  --> .getPoolCount() [calls] [INFERRED]
  --> discoverPools() [calls] [EXTRACTED]

==> graphify explain discoverProtocol\(\)
Node: discoverProtocol()
  ID:        discover_discoverprotocol
  Source:    src/discovery/discover.ts L199
  Type:      code
  Community: 3
  Degree:    19

Connections (19):
  --> discover.ts [contains] [EXTRACTED]
  --> log() [calls] [INFERRED]
  --> getDiscoveryQuerySpec() [calls] [EXTRACTED]
  --> getCheckpoint() [calls] [INFERRED]
  --> setCheckpoint() [calls] [INFERRED]
  --> getPoolCountForProtocol() [calls] [INFERRED]
  --> decodeDiscoveryLogs() [calls] [EXTRACTED]
  --> .setCheckpoint() [calls] [INFERRED]
  --> batchUpsertPools() [calls] [INFERRED]
  --> .decodeLogs() [calls] [INFERRED]
  --> buildDiscoveryScanQuery() [calls] [EXTRACTED]
  --> .getCheckpoint() [calls] [INFERRED]
  --> enrichDiscoveredPools() [calls] [EXTRACTED]
  --> discover() [calls] [INFERRED]
  --> discover() [calls] [INFERRED]
  --> .batchUpsertPools() [calls] [INFERRED]
  --> discoveryCheckpointFromNextBlock() [calls] [EXTRACTED]
  --> buildDiscoveredPoolBatch() [calls] [INFERRED]
  --> .getPoolCountForProtocol() [calls] [INFERRED]

==> graphify explain buildDiscoveryScanQuery\(\)
Node: buildDiscoveryScanQuery()
  ID:        discover_builddiscoveryscanquery
  Source:    src/discovery/discover.ts L160
  Type:      code
  Community: 3
  Degree:    5

Connections (5):
  --> discover.ts [contains] [EXTRACTED]
  --> discoverProtocol() [calls] [EXTRACTED]
  --> getDiscoveryQuerySpec() [calls] [EXTRACTED]
  --> buildHyperSyncLogQuery() [calls] [INFERRED]
  --> discoveryQueryToBlock() [calls] [EXTRACTED]

==> graphify explain discoverCurveListedFactory\(\)
Node: discoverCurveListedFactory()
  ID:        curve_list_factory_discovercurvelistedfactory
  Source:    src/protocols/curve_list_factory.ts L87
  Type:      code
  Community: 3
  Degree:    15

Connections (15):
  --> log() [calls] [INFERRED]
  --> curve_list_factory.ts [contains] [EXTRACTED]
  --> throttledMap() [calls] [INFERRED]
  --> readContractWithRetry() [calls] [INFERRED]
  --> setCheckpoint() [calls] [INFERRED]
  --> getPools() [calls] [INFERRED]
  --> batchUpsertPools() [calls] [INFERRED]
  --> .getPools() [calls] [INFERRED]
  --> .setCheckpoint() [calls] [INFERRED]
  --> getPoolAddressesForProtocol() [calls] [INFERRED]
  --> discoverStartIndex() [calls] [EXTRACTED]
  --> discover() [calls] [INFERRED]
  --> discover() [calls] [INFERRED]
  --> .batchUpsertPools() [calls] [INFERRED]
  --> .getPoolAddressesForProtocol() [calls] [INFERRED]

==> graphify explain discoverCurveRemovals\(\)
Node: discoverCurveRemovals()
  ID:        discover_discovercurveremovals
  Source:    src/discovery/discover.ts L293
  Type:      code
  Community: 1
  Degree:    17

Connections (17):
  --> .get() [calls] [INFERRED]
  --> get() [calls] [INFERRED]
  --> .get() [calls] [INFERRED]
  --> discover.ts [contains] [EXTRACTED]
  --> log() [calls] [INFERRED]
  --> getDiscoveryQuerySpec() [calls] [EXTRACTED]
  --> getCheckpoint() [calls] [INFERRED]
  --> batchRemovePools() [calls] [INFERRED]
  --> setCheckpoint() [calls] [INFERRED]
  --> buildHyperSyncLogQuery() [calls] [INFERRED]
  --> .setCheckpoint() [calls] [INFERRED]
  --> .decodeLogs() [calls] [INFERRED]
  --> .getCheckpoint() [calls] [INFERRED]
  --> fetchAllLogs() [calls] [INFERRED]
  --> discoveryQueryToBlock() [calls] [EXTRACTED]
  --> discoveryCheckpointFromNextBlock() [calls] [EXTRACTED]
  --> .batchRemovePools() [calls] [INFERRED]

==> graphify explain RegistryService
Node: RegistryService
  ID:        registry_registryservice
  Source:    src/db/registry.ts L72
  Type:      code
  Community: 3
  Degree:    61

Connections (61):
  --> registry.ts [contains] [EXTRACTED]
  --> .getTokenDecimals() [method] [EXTRACTED]
  --> .getTokenMeta() [method] [EXTRACTED]
  --> ._normalizeTokenAddress() [method] [EXTRACTED]
  --> ._refreshTokenMetaCacheAfterWrite() [method] [EXTRACTED]
  --> .getActivePoolsMeta() [method] [EXTRACTED]
  --> .getPoolMeta() [method] [EXTRACTED]
  --> .getPoolFee() [method] [EXTRACTED]
  --> ._normalizePoolAddress() [method] [EXTRACTED]
  --> .getPools() [method] [EXTRACTED]
  --> .setCheckpoint() [method] [EXTRACTED]
  --> ._invalidatePoolMetaCache() [method] [EXTRACTED]
  --> ._cacheTokenMetaEntry() [method] [EXTRACTED]
  --> ._invalidateTokenAssetCacheEntry() [method] [EXTRACTED]
  --> .getCheckpoint() [method] [EXTRACTED]
  --> .rollbackWatcherState() [method] [EXTRACTED]
  --> .constructor() [method] [EXTRACTED]
  --> ._initSchema() [method] [EXTRACTED]
  --> ._cachePoolFeeEntry() [method] [EXTRACTED]
  --> ._invalidatePoolFeeCacheEntry() [method] [EXTRACTED]
  ... and 41 more

==> graphify explain seedNewPoolsIntoStateCache\(\)
Node: seedNewPoolsIntoStateCache()
  ID:        discovery_refresh_seednewpoolsintostatecache
  Source:    src/runtime/discovery_refresh.ts L41
  Type:      code
  Community: 8
  Degree:    2

Connections (2):
  --> getPoolTokens() [calls] [INFERRED]
  --> discovery_refresh.ts [contains] [EXTRACTED]

==> graphify explain refreshCycles\(\)
Node: refreshCycles()
  ID:        runner_refreshcycles
  Source:    runner.ts L516
  Type:      code
  Community: 0
  Degree:    2

Connections (2):
  --> runner.ts [contains] [EXTRACTED]
  --> createArbSearcher() [calls] [INFERRED]

==> graphify explain buildGraph\(\)
Node: buildGraph()
  ID:        graph_buildgraph
  Source:    src/routing/graph.ts L397
  Type:      code
  Community: 8
  Degree:    2

Connections (2):
  --> graph.ts [contains] [EXTRACTED]
  --> addPoolEdges() [calls] [EXTRACTED]

==> graphify explain enumerateCyclesDual\(\)
Node: enumerateCyclesDual()
  ID:        enumerate_cycles_enumeratecyclesdual
  Source:    src/routing/enumerate_cycles.ts L137
  Type:      code
  Community: 8
  Degree:    6

Connections (6):
  --> enumerate_cycles.ts [contains] [EXTRACTED]
  --> findArbPaths() [calls] [INFERRED]
  --> selectTopPaths() [calls] [EXTRACTED]
  --> deduplicatePaths() [calls] [INFERRED]
  --> pruneByLiquidity() [calls] [EXTRACTED]
  --> resolvePhaseBudget() [calls] [EXTRACTED]

==> graphify explain evaluatePathsParallel\(\)
Node: evaluatePathsParallel()
  ID:        simulator_evaluatepathsparallel
  Source:    src/routing/simulator.ts L277
  Type:      code
  Community: 6
  Degree:    3

Connections (3):
  --> simulator.ts [contains] [EXTRACTED]
  --> .evaluate() [calls] [INFERRED]
  --> evaluatePaths() [calls] [EXTRACTED]

==> graphify explain RouteCache
Node: RouteCache
  ID:        route_cache_routecache
  Source:    src/routing/route_cache.ts L48
  Type:      code
  Community: 12
  Degree:    11

Connections (11):
  --> .clear() [method] [EXTRACTED]
  --> route_cache.ts [contains] [EXTRACTED]
  --> ._rebuildIndex() [method] [EXTRACTED]
  --> .update() [method] [EXTRACTED]
  --> .getByPools() [method] [EXTRACTED]
  --> .prune() [method] [EXTRACTED]
  --> .removeByPools() [method] [EXTRACTED]
  --> .constructor() [method] [EXTRACTED]
  --> .getAll() [method] [EXTRACTED]
  --> .size() [method] [EXTRACTED]
  --> .routes() [method] [EXTRACTED]

==> graphify explain PriceOracle
Node: PriceOracle
  ID:        price_oracle_priceoracle
  Source:    src/profit/price_oracle.ts L90
  Type:      code
  Community: 1
  Degree:    16

Connections (16):
  --> .update() [method] [EXTRACTED]
  --> .getRate() [method] [EXTRACTED]
  --> ._getDecimals() [method] [EXTRACTED]
  --> price_oracle.ts [contains] [EXTRACTED]
  --> ._storePairQuote() [method] [EXTRACTED]
  --> .getFreshRate() [method] [EXTRACTED]
  --> .constructor() [method] [EXTRACTED]
  --> ._setDefaults() [method] [EXTRACTED]
  --> .toMatic() [method] [EXTRACTED]
  --> .fromMatic() [method] [EXTRACTED]
  --> ._scaledRateToWei() [method] [EXTRACTED]
  --> ._pivotQuoteToWei() [method] [EXTRACTED]
  --> ._getStateUpdatedAt() [method] [EXTRACTED]
  --> ._maxUpdatedAt() [method] [EXTRACTED]
  --> ._deriveQuoteRateScaled() [method] [EXTRACTED]
  --> .isFresh() [method] [EXTRACTED]

==> graphify explain assessRouteResult\(\)
Node: assessRouteResult()
  ID:        assessment_assessrouteresult
  Source:    src/arb/assessment.ts L70
  Type:      code
  Community: 0
  Degree:    5

Connections (5):
  --> assessment.ts [contains] [EXTRACTED]
  --> computeProfit() [calls] [INFERRED]
  --> createRouteRevalidator() [calls] [INFERRED]
  --> getPathHopCount() [calls] [INFERRED]
  --> minProfitInTokenUnits() [calls] [EXTRACTED]

==> graphify explain createExecutionCoordinator\(\)
Node: createExecutionCoordinator()
  ID:        execution_coordinator_createexecutioncoordinator
  Source:    src/arb/execution_coordinator.ts L39
  Type:      code
  Community: 0
  Degree:    2

Connections (2):
  --> execution_coordinator.ts [contains] [EXTRACTED]
  --> createOpportunityEngine() [calls] [INFERRED]

==> graphify explain WorkerPool
Node: WorkerPool
  ID:        worker_pool_workerpool
  Source:    src/routing/worker_pool.ts L281
  Type:      code
  Community: 6
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

==> graphify explain runPass
Node: runPass()
  ID:        runner_runpass
  Source:    runner.ts L640
  Type:      code
  Community: 0
  Degree:    1

Connections (1):
  --> runner.ts [contains] [EXTRACTED]

==> graphify explain opportunity_engine.ts
Node: opportunity_engine.ts
  ID:        src_arb_opportunity_engine_ts
  Source:    src/arb/opportunity_engine.ts L1
  Type:      code
  Community: 0
  Degree:    6

Connections (6):
  --> runner.ts [imports_from] [EXTRACTED]
  --> assessment.ts [imports_from] [EXTRACTED]
  --> search.ts [imports_from] [EXTRACTED]
  --> execution_coordinator.ts [imports_from] [EXTRACTED]
  --> createOpportunityEngine() [contains] [EXTRACTED]
  --> route_revalidation.ts [imports_from] [EXTRACTED]

==> graphify explain sendTx\(\)
Node: sendTx()
  ID:        send_tx_sendtx
  Source:    src/execution/send_tx.ts L255
  Type:      code
  Community: 14
  Degree:    10

Connections (10):
  --> send_tx.ts [contains] [EXTRACTED]
  --> .resync() [calls] [INFERRED]
  --> .next() [calls] [INFERRED]
  --> .revert() [calls] [INFERRED]
  --> .confirm() [calls] [INFERRED]
  --> clearTrackedReceipt() [calls] [EXTRACTED]
  --> trackSubmittedTx() [calls] [EXTRACTED]
  --> classifySubmissionError() [calls] [EXTRACTED]
  --> logFailure() [calls] [EXTRACTED]
  --> dryRun() [calls] [EXTRACTED]

Run complete.
- Output: /home/x/arb/t/graphify-out/discovery-bot-runs/20260426T013645Z/OUTPUT.md
- Scope: /home/x/arb/t/graphify-out/discovery-bot-runs/20260426T013645Z/SCOPE.md
- Commands: /home/x/arb/t/graphify-out/discovery-bot-runs/20260426T013645Z/commands.tsv
- Status: /home/x/arb/t/graphify-out/discovery-bot-runs/20260426T013645Z/STATUS.md
