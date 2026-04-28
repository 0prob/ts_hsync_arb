```bash
graphify query Audit\ runtime\ configuration\ and\ operator\ scripts\ across\ package.json\,\ .env.example\,\ src/config/index.ts\,\ runner.ts\,\ tune_performance.ts\,\ performance\ cache\ files\,\ metrics\ configuration\,\ HyperSync/RPC\ env\ vars\,\ live-mode\ keys\,\ and\ test\ entrypoints.\ Find\ hard-coded\ defaults\,\ undocumented\ env\ vars\,\ unsafe\ fallbacks\,\ script\ drift\,\ and\ misconfigurations\ that\ could\ make\ a\ production\ run\ differ\ from\ tested\ behavior. --budget 1200
```

NODE .get() [src=src/db/registry_meta_cache.ts loc=L46 community=2]
NODE .get() [src=src/db/sqlite.ts loc=L27 community=2]
NODE get() [src=scripts/test_hypersync_paginate.ts loc=L50 community=2]
NODE runner.ts [src=runner.ts loc=L1 community=0]
NODE finder.ts [src=src/routing/finder.ts loc=L1 community=8]
NODE watcher_state_ops.ts [src=src/state/watcher_state_ops.ts loc=L1 community=3]
NODE test_engine_e2e.ts [src=scripts/test_engine_e2e.ts loc=L1 community=0]
NODE optimization_candidates.ts [src=src/routing/optimization_candidates.ts loc=L1 community=0]
NODE score_route.ts [src=src/routing/score_route.ts loc=L1 community=0]
NODE handleWatcherLogs() [src=src/state/watcher_state_ops.ts loc=L26 community=3]
NODE bigint.ts [src=src/util/bigint.ts loc=L1 community=12]
NODE .getPoolMeta() [src=src/db/registry.ts loc=L386 community=2]
NODE candidate_pipeline.ts [src=src/routing/candidate_pipeline.ts loc=L1 community=0]
NODE scoreForCandidate() [src=src/routing/optimization_candidates.ts loc=L45 community=2]
NODE evaluateCandidatePipeline() [src=src/routing/candidate_pipeline.ts loc=L46 community=0]
NODE toTopicArray() [src=src/state/watcher_state_ops.ts loc=L22 community=3]
NODE ._handleLogs() [src=src/state/watcher.ts loc=L986 community=4]
NODE recoverInvalidV3LiquidityMutation() [src=src/state/watcher_state_ops.ts loc=L141 community=3]
NODE selectOptimizationCandidates() [src=src/routing/optimization_candidates.ts loc=L74 community=0]
NODE test_optimization_candidates.ts [src=scripts/test_optimization_candidates.ts loc=L1 community=0]
NODE test_candidate_pipeline_assessment.ts [src=scripts/test_candidate_pipeline_assessment.ts loc=L1 community=0]
NODE normalizeCandidateLimit() [src=src/routing/optimization_candidates.ts loc=L30 community=0]
NODE watcher_protocol_handlers.ts [src=src/state/watcher_protocol_handlers.ts loc=L1 community=3]
NODE recordAssessmentReject() [src=src/routing/candidate_pipeline.ts loc=L40 community=0]
NODE cloneWatcherState() [src=src/state/watcher_state_ops.ts loc=L256 community=3]
NODE shouldOptimizeCandidate() [src=src/routing/optimization_candidates.ts loc=L142 community=0]
NODE createWatcherProtocolHandlers() [src=src/state/watcher_protocol_handlers.ts loc=L6 community=3]
NODE candidate() [src=scripts/test_candidate_pipeline_assessment.ts loc=L8 community=0]
NODE isViableQuickCandidate() [src=src/routing/optimization_candidates.ts loc=L41 community=0]
NODE compareCandidateProfit() [src=src/routing/optimization_candidates.ts loc=L35 community=0]
NODE candidate() [src=scripts/test_optimization_candidates.ts loc=L5 community=0]
EDGE test_optimization_candidates.ts --imports_from [EXTRACTED]--> optimization_candidates.ts
EDGE test_candidate_pipeline_assessment.ts --imports_from [EXTRACTED]--> candidate_pipeline.ts
EDGE createWatcherProtocolHandlers() --contains [EXTRACTED]--> watcher_protocol_handlers.ts
EDGE createWatcherProtocolHandlers() --calls [INFERRED]--> handleWatcherLogs()
EDGE candidate_pipeline.ts --imports_from [EXTRACTED]--> runner.ts
EDGE candidate_pipeline.ts --imports_from [EXTRACTED]--> test_engine_e2e.ts
EDGE candidate_pipeline.ts --contains [EXTRACTED]--> recordAssessmentReject()
EDGE candidate_pipeline.ts --contains [EXTRACTED]--> evaluateCandidatePipeline()
EDGE optimization_candidates.ts --imports_from [EXTRACTED]--> bigint.ts
EDGE optimization_candidates.ts --imports_from [EXTRACTED]--> finder.ts
EDGE optimization_candidates.ts --imports_from [EXTRACTED]--> score_route.ts
EDGE optimization_candidates.ts --contains [EXTRACTED]--> normalizeCandidateLimit()
EDGE optimization_candidates.ts --con
... (truncated to ~1200 token budget)
