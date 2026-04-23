# Graph Report - t  (2026-04-23)

## Corpus Check
- 140 files · ~134,965 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 780 nodes · 1646 edges · 21 communities detected
- Extraction: 70% EXTRACTED · 30% INFERRED · 0% AMBIGUOUS · INFERRED: 489 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]

## God Nodes (most connected - your core abstractions)
1. `get()` - 62 edges
2. `RegistryService` - 50 edges
3. `log()` - 34 edges
4. `StateWatcher` - 21 edges
5. `WorkerPool` - 20 edges
6. `discoverProtocol()` - 19 edges
7. `RpcManager` - 17 edges
8. `refreshCycles()` - 16 edges
9. `PriceOracle` - 16 edges
10. `executeWithRpcRetry()` - 16 edges

## Surprising Connections (you probably didn't know these)
- `main()` --calls--> `startTui()`  [INFERRED]
  runner.ts → src/tui/index.tsx
- `main()` --calls--> `startMetricsServer()`  [INFERRED]
  runner.ts → src/utils/metrics.ts
- `log()` --calls--> `fetchAllLogsWithClient()`  [INFERRED]
  runner.ts → src/hypersync/paginate.ts
- `log()` --calls--> `enrichDiscoveredPools()`  [INFERRED]
  runner.ts → src/discovery/discover.ts
- `log()` --calls--> `discoverProtocol()`  [INFERRED]
  runner.ts → src/discovery/discover.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.03
Nodes (45): mergeStateIntoCache(), reloadCacheFromRegistry(), throwUnsupportedHypersync(), UnsupportedDecoder, discoverCurveListedFactory(), detectReorg(), pick(), decodeDiscoveryLogs() (+37 more)

### Community 1 - "Community 1"
Cohesion: 0.05
Nodes (65): getPathFreshness(), assetStmt(), batchUpsertTokenMeta(), getPoolFee(), getTokenDecimals(), getTokenMeta(), normalizeTokenAddress(), normalizeTokenDecimals() (+57 more)

### Community 2 - "Community 2"
Cohesion: 0.05
Nodes (29): PollBalancer, PollCurve, PollUniv2, _completePass(), _startLoop(), _storeBatchResults(), PriceOracle, createRegistryRepositories() (+21 more)

### Community 3 - "Community 3"
Cohesion: 0.07
Nodes (37): toFiniteNumber(), enumerateCycles(), enumerateCyclesDual(), enumerateCyclesForToken(), pruneByLiquidity(), sortByLogWeight(), annotatePath(), deduplicatePaths() (+29 more)

### Community 4 - "Community 4"
Cohesion: 0.06
Nodes (18): gasEstimateCacheKeyForRoute(), routeKeyFromEdges(), clearGasEstimateCache(), RouteCache, routeExecutionCacheKey(), routeIdentityFromEdges(), routeIdentityFromSerializedPath(), mergeCandidateBatch() (+10 more)

### Community 5 - "Community 5"
Cohesion: 0.08
Nodes (32): assessmentNetProfit(), assessRouteResult(), compareAssessmentProfit(), getAssessmentOptimizationOptions(), getOptimizationOptions(), minProfitInTokenUnits(), applySlippage(), bigintToApproxNumber() (+24 more)

### Community 6 - "Community 6"
Cohesion: 0.08
Nodes (25): assertValidRouteForExecution(), buildArbTx(), buildTransferTx(), resolveFlashLoan(), buildFlashParams(), callbackProtocolId(), computeRouteHash(), encodeBalancerHop() (+17 more)

### Community 7 - "Community 7"
Cohesion: 0.08
Nodes (26): defaultRates(), getCurveAmountIn(), getCurveAmountOut(), getD(), getY(), simulateCurveSwap(), toXp(), normalizeBalancerState() (+18 more)

### Community 8 - "Community 8"
Cohesion: 0.09
Nodes (20): getBalancerTokens(), enrichTokens(), getCurveTokens(), enrichTokens(), isNoDataReadContractError(), multicallWithRetry(), readContractWithRetry(), rpcShortUrl() (+12 more)

### Community 9 - "Community 9"
Cohesion: 0.11
Nodes (9): executeWithRpcRetry(), isEndpointCapabilityError(), _isMethodUnavailableError(), isRateLimitError(), isRetryableError(), lazyMetrics(), RpcEndpoint, RpcManager (+1 more)

### Community 10 - "Community 10"
Cohesion: 0.16
Nodes (11): NonceManager, clearTrackedReceipt(), dryRun(), logFailure(), pollPendingReceipts(), pollTrackedReceipt(), sendTx(), sendTxBundle() (+3 more)

### Community 11 - "Community 11"
Cohesion: 0.1
Nodes (3): fetchAbi(), fetchAbiWithRetry(), sleep()

### Community 12 - "Community 12"
Cohesion: 0.21
Nodes (16): divRoundingUp(), mulDiv(), mulDivRoundingUp(), getAmount0Delta(), getAmount1Delta(), getNextSqrtPriceFromAmount0RoundingUp(), getNextSqrtPriceFromAmount1RoundingDown(), getNextSqrtPriceFromInput() (+8 more)

### Community 13 - "Community 13"
Cohesion: 0.16
Nodes (11): evaluateCandidatePipeline(), scoreForCandidate(), selectOptimizationCandidates(), shouldOptimizeCandidate(), bigintToApproxNumber(), estimateGasCostWei(), gasCostInStartTokenUnits(), rankRoutes() (+3 more)

### Community 14 - "Community 14"
Cohesion: 0.29
Nodes (10): colorize(), formatLogs(), formatStatus(), normalizeOpportunity(), pad(), renderFrame(), section(), startTui() (+2 more)

### Community 15 - "Community 15"
Cohesion: 0.36
Nodes (9): jsonRpc(), polygonPrivateMempoolHeaders(), privateMempoolSupportsBundles(), racePublicRPCs(), sendBundleAlchemy(), sendPolygonPrivateTransaction(), sendPrivateBundle(), sendPrivateTransaction() (+1 more)

### Community 16 - "Community 16"
Cohesion: 0.22
Nodes (3): startMetricsServer(), stopMetricsServer(), CompatDatabase

### Community 17 - "Community 17"
Cohesion: 0.44
Nodes (7): exp(), getBalancerAmountIn(), getBalancerAmountOut(), ln(), powDown(), simulateBalancerSwap(), toBigInt()

### Community 18 - "Community 18"
Cohesion: 0.31
Nodes (6): configureWatcherCallbacks(), createArbScheduler(), createShutdownHandler(), testSchedulerWaitForIdle(), testShutdownWaitsForOwnedWork(), testWatcherCallbacksScheduleAfterStateWork()

### Community 19 - "Community 19"
Cohesion: 0.32
Nodes (2): RegistryMetaCache, loadPoolMetaCache()

### Community 20 - "Community 20"
Cohesion: 0.4
Nodes (1): partitionFreshCandidates()

## Knowledge Gaps
- **Thin community `Community 19`** (8 nodes): `registry_meta_cache.ts`, `RegistryMetaCache`, `.constructor()`, `.get()`, `.getActive()`, `.getAll()`, `loadPoolMetaCache()`, `._getPoolMetaCache()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 20`** (5 nodes): `partitionFreshCandidates()`, `test_filter_fresh_candidates.ts`, `test_path_freshness.ts`, `filter_fresh_candidates.ts`, `path_freshness.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `log()` connect `Community 2` to `Community 0`, `Community 3`, `Community 5`, `Community 7`, `Community 10`, `Community 15`?**
  _High betweenness centrality (0.122) - this node is a cross-community bridge._
- **Why does `get()` connect `Community 1` to `Community 0`, `Community 2`, `Community 3`, `Community 4`, `Community 5`, `Community 6`, `Community 7`, `Community 10`, `Community 12`?**
  _High betweenness centrality (0.122) - this node is a cross-community bridge._
- **Why does `RegistryService` connect `Community 0` to `Community 16`, `Community 1`, `Community 2`, `Community 19`?**
  _High betweenness centrality (0.097) - this node is a cross-community bridge._
- **Are the 61 inferred relationships involving `get()` (e.g. with `partitionChangedPools()` and `fetchAllLogsWithClient()`) actually correct?**
  _`get()` has 61 INFERRED edges - model-reasoned connections that need verification._
- **Are the 28 inferred relationships involving `log()` (e.g. with `fetchAllLogsWithClient()` and `enrichDiscoveredPools()`) actually correct?**
  _`log()` has 28 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.03 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._