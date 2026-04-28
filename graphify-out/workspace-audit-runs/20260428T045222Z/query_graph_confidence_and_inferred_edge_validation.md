```bash
graphify query Review\ the\ current\ graph\ report\'s\ high-INFERRED\ nodes\ and\ surprising\ connections.\ Prioritize\ inferred\ edges\ around\ get\(\)\,\ normalizeEvmAddress\(\)\,\ normalizeProtocolKey\(\)\,\ log\(\)\,\ startMetricsServer\,\ RegistryService\,\ StateWatcher\,\ RpcManager\,\ and\ route\ topology.\ Identify\ which\ inferred\ edges\ are\ likely\ false\ positives\,\ which\ deserve\ manual\ source\ verification\,\ and\ which\ should\ become\ concrete\ Graphify\ path\ or\ explain\ checks. --budget 800
```

NODE .get() [src=src/db/registry_meta_cache.ts loc=L46 community=2]
NODE get() [src=scripts/test_hypersync_paginate.ts loc=L50 community=2]
NODE .get() [src=src/db/sqlite.ts loc=L27 community=2]
NODE finder.ts [src=src/routing/finder.ts loc=L1 community=8]
NODE watcher_state_ops.ts [src=src/state/watcher_state_ops.ts loc=L1 community=3]
NODE optimization_candidates.ts [src=src/routing/optimization_candidates.ts loc=L1 community=0]
NODE score_route.ts [src=src/routing/score_route.ts loc=L1 community=0]
NODE createArbSearcher() [src=src/arb/search.ts loc=L239 community=0]
NODE handleWatcherLogs() [src=src/state/watcher_state_ops.ts loc=L26 community=3]
NODE bigint.ts [src=src/util/bigint.ts loc=L1 community=12]
NODE candidate_pipeline.ts [src=src/routing/candidate_pipeline.ts loc=L1 community=0]
NODE .getPoolMeta() [src=src/db/registry.ts loc=L386 community=2]
NODE scoreForCandidate() [src=src/routing/optimization_candidates.ts loc=L45 community=2]
NODE evaluateCandidatePipeline() [src=src/routing/candidate_pipeline.ts loc=L46 community=0]
NODE ._handleLogs() [src=src/state/watcher.ts loc=L986 community=4]
NODE toTopicArray() [src=src/state/watcher_state_ops.ts loc=L22 community=3]
NODE recoverInvalidV3LiquidityMutation() [src=src/state/watcher_state_ops.ts loc=L141 community=3]
NODE selectOptimizationCandidates() [src=src/routing/optimization_candidates.ts loc=L74 community=0]
NODE test_optimization_candidates.ts [src=scripts/test_optimization_candidates.ts loc=L1 community=0]
NODE watcher_protocol_handlers.ts [src=src/state/watcher_protocol_handlers.ts loc=L1 community=3]
NODE createWatcherProtocolHandlers() [src=src/state/watcher_protocol_handlers.ts loc=L6 community=3]
NODE normalizeCandidateLimit() [src=src/routing/optimization_candidates.ts loc=L30 community=0]
NODE recordAssessmentReject() [src=src/routing/candidate_pipeline.ts loc=L40 community=0]
NODE shouldOptimizeCandidate() [src=src/routing/optimization_candidates.ts loc=L142 community=0]
NODE cloneWatcherState() [src=src/state/watcher_state_ops.ts loc=L256 community=3]
NODE test_candidate_pipeline_assessment.ts [src=scripts/test_candidate_pipeline_assessment.ts loc=L1 community=0]
NODE candidate() [src=scripts/test_candidate_pipeline_assessment.ts loc=L8 community=0]
NODE compareCandidateProfit() [src=src/routing/optimization_candidates.ts loc=L35 community=0]
NODE candidate() [src=scripts/test_op
... (truncated to ~800 token budget)
