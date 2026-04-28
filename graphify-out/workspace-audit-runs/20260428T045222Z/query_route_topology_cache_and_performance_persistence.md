```bash
graphify query Audit\ topology\ and\ route-cycle\ cache\ behavior\ across\ createTopologyService\,\ topology_cache\,\ route\ cycle\ cache\ files\,\ refreshCycles\,\ enumerateCycles\,\ enumerateCyclesDual\,\ selective\ 4-hop\ expansion\,\ dynamic\ pivot\ token\ selection\,\ worker\ pool\ startup\,\ and\ graph\ rebuild\ invalidation.\ Identify\ persistence\ gaps\,\ stale-cache\ risks\,\ unnecessary\ recomputation\,\ and\ performance\ knobs\ that\ should\ be\ bounded\ or\ tested. --budget 800
```

NODE .get() [src=src/db/registry_meta_cache.ts loc=L46 community=2]
NODE get() [src=scripts/test_hypersync_paginate.ts loc=L50 community=2]
NODE .get() [src=src/db/sqlite.ts loc=L27 community=2]
NODE finder.ts [src=src/routing/finder.ts loc=L1 community=8]
NODE watcher_state_ops.ts [src=src/state/watcher_state_ops.ts loc=L1 community=3]
NODE route_identity.ts [src=src/routing/route_identity.ts loc=L1 community=12]
NODE topology_service.ts [src=src/runtime/topology_service.ts loc=L1 community=12]
NODE score_route.ts [src=src/routing/score_route.ts loc=L1 community=0]
NODE optimization_candidates.ts [src=src/routing/optimization_candidates.ts loc=L1 community=0]
NODE handleWatcherLogs() [src=src/state/watcher_state_ops.ts loc=L26 community=3]
NODE createArbSearcher() [src=src/arb/search.ts loc=L239 community=0]
NODE bigint.ts [src=src/util/bigint.ts loc=L1 community=12]
NODE candidate_pipeline.ts [src=src/routing/candidate_pipeline.ts loc=L1 community=0]
NODE .getPoolMeta() [src=src/db/registry.ts loc=L386 community=2]
NODE scoreForCandidate() [src=src/routing/optimization_candidates.ts loc=L45 community=2]
NODE topology_cache.ts [src=src/arb/topology_cache.ts loc=L1 community=12]
NODE evaluateCandidatePipeline() [src=src/routing/candidate_pipeline.ts loc=L46 community=0]
NODE ._handleLogs() [src=src/state/watcher.ts loc=L986 community=4]
NODE recoverInvalidV3LiquidityMutation() [src=src/state/watcher_state_ops.ts loc=L141 community=3]
NODE toTopicArray() [src=src/state/watcher_state_ops.ts loc=L22 community=3]
NODE selectOptimizationCandidates() [src=src/routing/optimization_candidates.ts loc=L74 community=0]
NODE createTopologyService() [src=src/runtime/topology_service.ts loc=L73 community=12]
NODE shouldOptimizeCandidate() [src=src/routing/optimization_candidates.ts loc=L142 community=0]
NODE normalizeCandidateLimit() [src=src/routing/optimization_candidates.ts loc=L30 community=0]
NODE watcher_protocol_handlers.ts [src=src/state/watcher_protocol_handlers.ts loc=L1 community=3]
NODE cacheService() [src=scripts/test_topology_service.ts loc=L211 community=12]
NODE test_optimization_candidates.ts [src=scripts/test_optimization_candidates.ts loc=L1 community=0]
NODE test_candidate_pipeline_assessment.ts [src=scripts/test_candidate_pipeline_assessment.ts loc=L1 community=0]
NODE recordAssessmentReject() [src=src/routing/candidate_pipeline.ts loc=L40 community=0
... (truncated to ~800 token budget)
