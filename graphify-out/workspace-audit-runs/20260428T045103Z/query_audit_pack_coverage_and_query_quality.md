```bash
graphify query Audit\ scripts/graphify_workspace_audit_queries.sh\ and\ the\ other\ graphify_\*\ query\ packs\ as\ first-class\ tooling.\ Identify\ stale\ questions\,\ duplicated\ coverage\,\ missing\ risk\ surfaces\,\ output\ usability\ problems\,\ brittle\ command\ handling\,\ missing\ budgets\,\ poor\ artifact\ links\,\ and\ queries\ that\ should\ be\ split\ or\ made\ more\ specific.\ Recommend\ concrete\ edits\ to\ the\ pack. --budget 1200
```

NODE .get() [src=src/db/registry_meta_cache.ts loc=L46 community=2]
NODE get() [src=scripts/test_hypersync_paginate.ts loc=L50 community=2]
NODE .get() [src=src/db/sqlite.ts loc=L27 community=2]
NODE finder.ts [src=src/routing/finder.ts loc=L1 community=8]
NODE watcher_state_ops.ts [src=src/state/watcher_state_ops.ts loc=L1 community=3]
NODE score_route.ts [src=src/routing/score_route.ts loc=L1 community=0]
NODE optimization_candidates.ts [src=src/routing/optimization_candidates.ts loc=L1 community=0]
NODE createArbSearcher() [src=src/arb/search.ts loc=L239 community=0]
NODE handleWatcherLogs() [src=src/state/watcher_state_ops.ts loc=L26 community=3]
NODE bigint.ts [src=src/util/bigint.ts loc=L1 community=12]
NODE candidate_pipeline.ts [src=src/routing/candidate_pipeline.ts loc=L1 community=0]
NODE .getPoolMeta() [src=src/db/registry.ts loc=L386 community=2]
NODE audit_etherscan_abis.ts [src=scripts/audit_etherscan_abis.ts loc=L1 community=23]
NODE evaluateCandidatePipeline() [src=src/routing/candidate_pipeline.ts loc=L46 community=0]
NODE scoreForCandidate() [src=src/routing/optimization_candidates.ts loc=L45 community=2]
NODE recoverInvalidV3LiquidityMutation() [src=src/state/watcher_state_ops.ts loc=L141 community=3]
NODE ._handleLogs() [src=src/state/watcher.ts loc=L986 community=4]
NODE toTopicArray() [src=src/state/watcher_state_ops.ts loc=L22 community=3]
NODE fetchAbiWithRetry() [src=scripts/audit_etherscan_abis.ts loc=L80 community=23]
NODE selectOptimizationCandidates() [src=src/routing/optimization_candidates.ts loc=L74 community=0]
NODE sleep() [src=scripts/audit_etherscan_abis.ts loc=L76 community=23]
NODE shouldOptimizeCandidate() [src=src/routing/optimization_candidates.ts loc=L142 community=0]
NODE cloneWatcherState() [src=src/state/watcher_state_ops.ts loc=L256 community=3]
NODE watcher_protocol_handlers.ts [src=src/state/watcher_protocol_handlers.ts loc=L1 community=3]
NODE fetchAbi() [src=scripts/audit_etherscan_abis.ts loc=L55 community=23]
NODE createWatcherProtocolHandlers() [src=src/state/watcher_protocol_handlers.ts loc=L6 community=3]
NODE test_optimization_candidates.ts [src=scripts/test_optimization_candidates.ts loc=L1 community=0]
NODE recordAssessmentReject() [src=src/routing/candidate_pipeline.ts loc=L40 community=0]
NODE test_candidate_pipeline_assessment.ts [src=scripts/test_candidate_pipeline_assessment.ts loc=L1 community=0]
NODE normalizeCandidateLimit() [src=src/routing/optimization_candidates.ts loc=L30 community=0]
NODE candidate() [src=scripts/test_optimization_candidates.ts loc=L5 community=0]
NODE matchesExpectation() [src=scripts/audit_etherscan_abis.ts loc=L27 community=23]
NODE candidate() [src=scripts/test_candidate_pipeline_assessment.ts loc=L8 community=0]
NODE contract_catalog.ts [src=src/protocols/contract_catalog.ts loc=L1 community=23]
NODE isViableQuickCandidate() [src=src/routing/optimization_candidates.ts loc=L41 community=0]
NODE compareCandidateProfit() [src=src/routing/optimization_candidates.ts loc=L35 community=0]
NODE canonicalType() [src=scripts/audit_etherscan_abis.ts loc=L17 community=23]
EDGE audit_etherscan_abis.ts --imports_from [EXTRACTED]--> contract_catalog.ts
EDGE audit_etherscan_abis.ts --contains [EXTRACTED]--> canonicalType()
EDGE audit_etherscan_abis.ts --contains [EXTRACTED]--> matchesExpectation()
EDGE audit_etherscan_abis.ts --contains [EXTRACTED]--> fetchAbi()
EDGE audit_etherscan_abis.ts --contains [EXTRACTED]--> sleep()
EDGE audit_etherscan_abis.ts --contains [EXTRACTED]--> fetchAbiWithRetry()
EDGE createWatcherProtocolHandlers() --contains [EXTRACTED]-->
... (truncated to ~1200 token budget)
