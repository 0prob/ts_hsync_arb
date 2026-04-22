# Graph Report - t  (2026-04-22)

## Corpus Check
- 140 files · ~132,450 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 770 nodes · 1612 edges · 18 communities detected
- Extraction: 70% EXTRACTED · 30% INFERRED · 0% AMBIGUOUS · INFERRED: 482 edges (avg confidence: 0.8)
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

## God Nodes (most connected - your core abstractions)
1. `get()` - 62 edges
2. `RegistryService` - 50 edges
3. `log()` - 33 edges
4. `discoverProtocol()` - 19 edges
5. `WorkerPool` - 19 edges
6. `StateWatcher` - 19 edges
7. `RpcManager` - 17 edges
8. `PriceOracle` - 16 edges
9. `executeWithRpcRetry()` - 16 edges
10. `refreshCycles()` - 15 edges

## Surprising Connections (you probably didn't know these)
- `main()` --calls--> `startTui()`  [INFERRED]
  runner.ts → src/tui/index.tsx
- `main()` --calls--> `startMetricsServer()`  [INFERRED]
  runner.ts → src/utils/metrics.ts
- `log()` --calls--> `quoteBasedLogWeight()`  [INFERRED]
  runner.ts → src/routing/finder.ts
- `log()` --calls--> `edgeSpotLogWeight()`  [INFERRED]
  runner.ts → src/routing/finder.ts
- `log()` --calls--> `sendPrivateBundle()`  [INFERRED]
  runner.ts → src/execution/private_tx.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.03
Nodes (39): mergeStateIntoCache(), reloadCacheFromRegistry(), throwUnsupportedHypersync(), UnsupportedDecoder, discoverCurveListedFactory(), detectReorg(), pick(), decodeDiscoveryLogs() (+31 more)

### Community 1 - "Community 1"
Cohesion: 0.05
Nodes (51): assetStmt(), batchUpsertTokenMeta(), getPoolFee(), getTokenDecimals(), getTokenMeta(), normalizeTokenAddress(), normalizeTokenDecimals(), normalizeTokenText() (+43 more)

### Community 2 - "Community 2"
Cohesion: 0.07
Nodes (32): toFiniteNumber(), annotatePath(), edgeSpotLogWeight(), find2HopPaths(), find3HopPaths(), find4HopPathsBidirectional(), findArbPaths(), pathCumulativeFeesBps() (+24 more)

### Community 3 - "Community 3"
Cohesion: 0.06
Nodes (41): assessmentNetProfit(), assessRouteResult(), compareAssessmentProfit(), getAssessmentOptimizationOptions(), getOptimizationOptions(), minProfitInTokenUnits(), applySlippage(), bigintToApproxNumber() (+33 more)

### Community 4 - "Community 4"
Cohesion: 0.06
Nodes (33): enumerateCycles(), enumerateCyclesDual(), enumerateCyclesForToken(), pruneByLiquidity(), sortByLogWeight(), partitionFreshCandidates(), deduplicatePaths(), configureWatcherCallbacks() (+25 more)

### Community 5 - "Community 5"
Cohesion: 0.05
Nodes (26): getBalancerTokens(), enrichTokens(), getCurveTokens(), enrichTokens(), fetchAndNormalizeBalancerPool(), fetchBalancerPoolState(), PollBalancer, readContractWithTimeout() (+18 more)

### Community 6 - "Community 6"
Cohesion: 0.07
Nodes (25): exp(), getBalancerAmountIn(), getBalancerAmountOut(), ln(), powDown(), simulateBalancerSwap(), toBigInt(), normalizeBalancerState() (+17 more)

### Community 7 - "Community 7"
Cohesion: 0.09
Nodes (25): assertValidRouteForExecution(), buildArbTx(), buildTransferTx(), resolveFlashLoan(), buildFlashParams(), callbackProtocolId(), computeRouteHash(), encodeBalancerHop() (+17 more)

### Community 8 - "Community 8"
Cohesion: 0.1
Nodes (11): executeWithRpcRetry(), isEndpointCapabilityError(), _isMethodUnavailableError(), isRateLimitError(), isRetryableError(), lazyMetrics(), RpcEndpoint, RpcManager (+3 more)

### Community 9 - "Community 9"
Cohesion: 0.09
Nodes (14): gasEstimateCacheKeyForRoute(), deserializeTopology(), routeExecutionCacheKey(), routeIdentityFromEdges(), routeIdentityFromSerializedPath(), buildEvaluationChunks(), collectChunkPoolAddresses(), getStateVersion() (+6 more)

### Community 10 - "Community 10"
Cohesion: 0.1
Nodes (5): clearGasEstimateCache(), startMetricsServer(), stopMetricsServer(), RouteCache, CompatDatabase

### Community 11 - "Community 11"
Cohesion: 0.18
Nodes (11): NonceManager, clearTrackedReceipt(), dryRun(), logFailure(), pollPendingReceipts(), pollTrackedReceipt(), sendTx(), sendTxBundle() (+3 more)

### Community 12 - "Community 12"
Cohesion: 0.17
Nodes (16): addPoolEdges(), buildGraph(), buildHubGraph(), createSwapEdge(), getFeeBps(), getLiveStateRef(), getProtocolKind(), getRoutablePoolContext() (+8 more)

### Community 13 - "Community 13"
Cohesion: 0.1
Nodes (3): fetchAbi(), fetchAbiWithRetry(), sleep()

### Community 14 - "Community 14"
Cohesion: 0.21
Nodes (16): divRoundingUp(), mulDiv(), mulDivRoundingUp(), getAmount0Delta(), getAmount1Delta(), getNextSqrtPriceFromAmount0RoundingUp(), getNextSqrtPriceFromAmount1RoundingDown(), getNextSqrtPriceFromInput() (+8 more)

### Community 15 - "Community 15"
Cohesion: 0.15
Nodes (9): jsonRpc(), polygonPrivateMempoolHeaders(), privateMempoolSupportsBundles(), racePublicRPCs(), sendBundleAlchemy(), sendPolygonPrivateTransaction(), sendPrivateBundle(), sendPrivateTransaction() (+1 more)

### Community 16 - "Community 16"
Cohesion: 0.16
Nodes (11): evaluateCandidatePipeline(), scoreForCandidate(), selectOptimizationCandidates(), shouldOptimizeCandidate(), bigintToApproxNumber(), estimateGasCostWei(), gasCostInStartTokenUnits(), rankRoutes() (+3 more)

### Community 17 - "Community 17"
Cohesion: 0.29
Nodes (10): colorize(), formatLogs(), formatStatus(), normalizeOpportunity(), pad(), renderFrame(), section(), startTui() (+2 more)

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `get()` connect `Community 2` to `Community 0`, `Community 1`, `Community 3`, `Community 6`, `Community 7`, `Community 9`, `Community 10`, `Community 11`, `Community 12`, `Community 14`?**
  _High betweenness centrality (0.133) - this node is a cross-community bridge._
- **Why does `log()` connect `Community 0` to `Community 2`, `Community 3`, `Community 4`, `Community 11`, `Community 15`?**
  _High betweenness centrality (0.121) - this node is a cross-community bridge._
- **Why does `RegistryService` connect `Community 0` to `Community 1`, `Community 2`, `Community 4`, `Community 6`, `Community 10`?**
  _High betweenness centrality (0.098) - this node is a cross-community bridge._
- **Are the 61 inferred relationships involving `get()` (e.g. with `partitionChangedPools()` and `fetchAllLogsWithClient()`) actually correct?**
  _`get()` has 61 INFERRED edges - model-reasoned connections that need verification._
- **Are the 28 inferred relationships involving `log()` (e.g. with `fetchAllLogsWithClient()` and `enrichDiscoveredPools()`) actually correct?**
  _`log()` has 28 INFERRED edges - model-reasoned connections that need verification._
- **Are the 13 inferred relationships involving `discoverProtocol()` (e.g. with `.getCheckpoint()` and `.getPoolCountForProtocol()`) actually correct?**
  _`discoverProtocol()` has 13 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.03 - nodes in this community are weakly interconnected._