# Graph Report - t  (2026-04-23)

## Corpus Check
- 149 files · ~146,279 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 819 nodes · 1864 edges · 19 communities detected
- Extraction: 67% EXTRACTED · 33% INFERRED · 0% AMBIGUOUS · INFERRED: 609 edges (avg confidence: 0.8)
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

## God Nodes (most connected - your core abstractions)
1. `get()` - 66 edges
2. `RegistryService` - 53 edges
3. `log()` - 35 edges
4. `StateWatcher` - 24 edges
5. `discoverProtocol()` - 23 edges
6. `WorkerPool` - 20 edges
7. `refreshCycles()` - 17 edges
8. `RpcManager` - 17 edges
9. `PriceOracle` - 16 edges
10. `executeWithRpcRetry()` - 16 edges

## Surprising Connections (you probably didn't know these)
- `main()` --calls--> `startTui()`  [INFERRED]
  runner.ts → src/tui/index.tsx
- `main()` --calls--> `startMetricsServer()`  [INFERRED]
  runner.ts → /home/x/t/src/utils/metrics.ts
- `partitionFreshCandidates()` --calls--> `createArbSearcher()`  [INFERRED]
  /home/x/t/src/routing/filter_fresh_candidates.ts → src/arb/search.ts
- `log()` --calls--> `_completePass()`  [INFERRED]
  runner.ts → /home/x/t/src/state/poller_base.ts
- `log()` --calls--> `_storeBatchResults()`  [INFERRED]
  runner.ts → /home/x/t/src/state/poller_base.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.03
Nodes (42): reloadCacheFromRegistry(), detectReorg(), pick(), discoverPools(), discoverPoolsWithDeps(), routeKeyFromEdges(), clearGasEstimateCache(), startMetricsServer() (+34 more)

### Community 1 - "Community 1"
Cohesion: 0.04
Nodes (49): toFiniteNumber(), takeTopNBy(), enumerateCycles(), enumerateCyclesDual(), enumerateCyclesForToken(), pruneByLiquidity(), selectTopPaths(), sortByLogWeight() (+41 more)

### Community 2 - "Community 2"
Cohesion: 0.08
Nodes (30): mergeStateIntoCache(), getDiscoveryQuerySpec(), find2HopPaths(), find3HopPaths(), find4HopPathsBidirectional(), findArbPaths(), shouldPruneEdge(), getLiveStateRef() (+22 more)

### Community 3 - "Community 3"
Cohesion: 0.05
Nodes (20): fetchAbi(), fetchAbiWithRetry(), sleep(), throwUnsupportedHypersync(), UnsupportedDecoder, decode(), buildDiscoveryScanQuery(), decodeDiscoveryLogs() (+12 more)

### Community 4 - "Community 4"
Cohesion: 0.06
Nodes (47): assetStmt(), batchUpsertTokenMeta(), getTokenDecimals(), normalizeTokenAddress(), normalizeTokenDecimals(), normalizeTokenText(), upsertPoolFee(), upsertTokenMeta() (+39 more)

### Community 5 - "Community 5"
Cohesion: 0.06
Nodes (29): exp(), getBalancerAmountIn(), getBalancerAmountOut(), ln(), powDown(), simulateBalancerSwap(), toBigInt(), gasEstimateCacheKeyForRoute() (+21 more)

### Community 6 - "Community 6"
Cohesion: 0.06
Nodes (5): discoverCurveListedFactory(), getPoolAddressesForProtocol(), validateAllPools(), RegistryService, runValidation()

### Community 7 - "Community 7"
Cohesion: 0.09
Nodes (25): assessmentNetProfit(), assessRouteResult(), compareAssessmentProfit(), getAssessmentOptimizationOptions(), getOptimizationOptions(), minProfitInTokenUnits(), applySlippage(), bigintToApproxNumber() (+17 more)

### Community 8 - "Community 8"
Cohesion: 0.1
Nodes (24): assertValidRouteForExecution(), buildArbTx(), buildTransferTx(), resolveFlashLoan(), buildFlashParams(), callbackProtocolId(), computeRouteHash(), encodeBalancerHop() (+16 more)

### Community 9 - "Community 9"
Cohesion: 0.1
Nodes (10): fetchGasPrice(), executeWithRpcRetry(), isEndpointCapabilityError(), _isMethodUnavailableError(), isRateLimitError(), isRetryableError(), lazyMetrics(), RpcEndpoint (+2 more)

### Community 10 - "Community 10"
Cohesion: 0.1
Nodes (21): getBalancerTokens(), enrichTokens(), getCurveTokens(), enrichTokens(), PollUniv2, isNoDataReadContractError(), multicallWithRetry(), readContractWithRetry() (+13 more)

### Community 11 - "Community 11"
Cohesion: 0.08
Nodes (14): fetchAndNormalizeBalancerPool(), fetchBalancerPoolState(), PollBalancer, readContractWithTimeout(), withTimeout(), BALANCE_ABI(), fetchAndNormalizeCurvePool(), fetchCurvePoolState() (+6 more)

### Community 12 - "Community 12"
Cohesion: 0.15
Nodes (20): defaultRates(), getCurveAmountIn(), getCurveAmountOut(), getD(), getY(), simulateCurveSwap(), toXp(), normalizeBalancerState() (+12 more)

### Community 13 - "Community 13"
Cohesion: 0.19
Nodes (12): NonceManager, clearTrackedReceipt(), dryRun(), logFailure(), mapWithConcurrency(), pollPendingReceipts(), pollTrackedReceipt(), sendTx() (+4 more)

### Community 14 - "Community 14"
Cohesion: 0.15
Nodes (13): evaluateCandidatePipeline(), scoreForCandidate(), selectOptimizationCandidates(), shouldOptimizeCandidate(), bigintToApproxNumber(), ceilDiv(), estimateGasCostWei(), gasCostInStartTokenUnits() (+5 more)

### Community 15 - "Community 15"
Cohesion: 0.16
Nodes (7): partitionFreshCandidates(), configureWatcherCallbacks(), createArbScheduler(), createShutdownHandler(), testSchedulerWaitForIdle(), testShutdownWaitsForOwnedWork(), testWatcherCallbacksScheduleAfterStateWork()

### Community 16 - "Community 16"
Cohesion: 0.36
Nodes (10): colorize(), formatLogs(), formatStatus(), normalizeOpportunity(), pad(), renderFrame(), section(), startTui() (+2 more)

### Community 17 - "Community 17"
Cohesion: 0.41
Nodes (10): divRoundingUp(), mulDiv(), mulDivRoundingUp(), getAmount0Delta(), getAmount1Delta(), getNextSqrtPriceFromAmount0RoundingUp(), getNextSqrtPriceFromAmount1RoundingDown(), getNextSqrtPriceFromInput() (+2 more)

### Community 18 - "Community 18"
Cohesion: 0.36
Nodes (9): jsonRpc(), polygonPrivateMempoolHeaders(), privateMempoolSupportsBundles(), racePublicRPCs(), sendBundleAlchemy(), sendPolygonPrivateTransaction(), sendPrivateBundle(), sendPrivateTransaction() (+1 more)

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `log()` connect `Community 1` to `Community 0`, `Community 2`, `Community 3`, `Community 6`, `Community 7`, `Community 13`, `Community 18`?**
  _High betweenness centrality (0.101) - this node is a cross-community bridge._
- **Why does `RegistryService` connect `Community 6` to `Community 0`, `Community 1`, `Community 2`, `Community 3`, `Community 4`?**
  _High betweenness centrality (0.082) - this node is a cross-community bridge._
- **Why does `executeWithRpcRetry()` connect `Community 9` to `Community 8`, `Community 10`?**
  _High betweenness centrality (0.074) - this node is a cross-community bridge._
- **Are the 65 inferred relationships involving `get()` (e.g. with `selectPendingQuietPools()` and `partitionChangedPools()`) actually correct?**
  _`get()` has 65 INFERRED edges - model-reasoned connections that need verification._
- **Are the 29 inferred relationships involving `log()` (e.g. with `quoteBasedLogWeight()` and `edgeSpotLogWeight()`) actually correct?**
  _`log()` has 29 INFERRED edges - model-reasoned connections that need verification._
- **Are the 17 inferred relationships involving `discoverProtocol()` (e.g. with `getCheckpoint()` and `getPoolCountForProtocol()`) actually correct?**
  _`discoverProtocol()` has 17 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.03 - nodes in this community are weakly interconnected._