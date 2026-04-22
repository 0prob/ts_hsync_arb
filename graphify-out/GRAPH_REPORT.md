# Graph Report - t  (2026-04-22)

## Corpus Check
- 125 files · ~118,737 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 716 nodes · 1440 edges · 18 communities detected
- Extraction: 72% EXTRACTED · 28% INFERRED · 0% AMBIGUOUS · INFERRED: 400 edges (avg confidence: 0.8)
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
1. `RegistryService` - 50 edges
2. `log()` - 31 edges
3. `discoverProtocol()` - 19 edges
4. `WorkerPool` - 19 edges
5. `StateWatcher` - 18 edges
6. `RpcManager` - 17 edges
7. `executeWithRpcRetry()` - 16 edges
8. `refreshCycles()` - 15 edges
9. `main()` - 13 edges
10. `discoverCurveRemovals()` - 13 edges

## Surprising Connections (you probably didn't know these)
- `log()` --calls--> `fetchAllLogs()`  [INFERRED]
  runner.ts → src/hypersync/paginate.ts
- `log()` --calls--> `discoverProtocol()`  [INFERRED]
  runner.ts → src/discovery/discover.ts
- `log()` --calls--> `discoverCurveRemovals()`  [INFERRED]
  runner.ts → src/discovery/discover.ts
- `log()` --calls--> `discoverPools()`  [INFERRED]
  runner.ts → src/discovery/discover.ts
- `log()` --calls--> `buildDiscoveredPoolBatch()`  [INFERRED]
  runner.ts → src/discovery/helpers.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.04
Nodes (22): throwUnsupportedHypersync(), UnsupportedDecoder, discoverCurveListedFactory(), detectReorg(), pick(), decodeDiscoveryLogs(), discoverCurveRemovals(), discoverPools() (+14 more)

### Community 1 - "Community 1"
Cohesion: 0.06
Nodes (60): assetStmt(), batchUpsertTokenMeta(), getPoolFee(), getTokenDecimals(), getTokenMeta(), normalizeTokenAddress(), normalizeTokenDecimals(), normalizeTokenText() (+52 more)

### Community 2 - "Community 2"
Cohesion: 0.05
Nodes (41): enrichDiscoveredPools(), normalizeBalancerState(), normalizeCurveState(), normalizePoolState(), normalizeV2State(), normalizeV3State(), validatePoolState(), fetchAndNormalizeBalancerPool() (+33 more)

### Community 3 - "Community 3"
Cohesion: 0.06
Nodes (24): partitionFreshCandidates(), startTui(), configureWatcherCallbacks(), startMetricsServer(), getPathFreshness(), PriceOracle, createRegistryRepositories(), fmtPath() (+16 more)

### Community 4 - "Community 4"
Cohesion: 0.06
Nodes (17): gasEstimateCacheKeyForRoute(), clearGasEstimateCache(), routeExecutionCacheKey(), routeIdentityFromEdges(), routeIdentityFromSerializedPath(), createTopologyCache(), createTopologyService(), buildChunkStateObject() (+9 more)

### Community 5 - "Community 5"
Cohesion: 0.1
Nodes (24): assertValidRouteForExecution(), buildArbTx(), buildTransferTx(), resolveFlashLoan(), buildFlashParams(), callbackProtocolId(), computeRouteHash(), encodeBalancerHop() (+16 more)

### Community 6 - "Community 6"
Cohesion: 0.12
Nodes (19): toFiniteNumber(), enumerateCycles(), enumerateCyclesDual(), enumerateCyclesForToken(), pruneByLiquidity(), sortByLogWeight(), annotatePath(), deduplicatePaths() (+11 more)

### Community 7 - "Community 7"
Cohesion: 0.08
Nodes (10): getBalancerTokens(), enrichTokens(), getCurveTokens(), enrichTokens(), isNoDataReadContractError(), multicallWithRetry(), readContractWithRetry(), rpcShortUrl() (+2 more)

### Community 8 - "Community 8"
Cohesion: 0.11
Nodes (9): executeWithRpcRetry(), isEndpointCapabilityError(), _isMethodUnavailableError(), isRateLimitError(), isRetryableError(), lazyMetrics(), RpcEndpoint, RpcManager (+1 more)

### Community 9 - "Community 9"
Cohesion: 0.09
Nodes (14): mergeStateIntoCache(), reloadCacheFromRegistry(), createWatcherProtocolHandlers(), cloneWatcherState(), commitWatcherState(), handleWatcherLogs(), mergeWatcherState(), persistWatcherState() (+6 more)

### Community 10 - "Community 10"
Cohesion: 0.12
Nodes (22): exp(), getBalancerAmountIn(), getBalancerAmountOut(), ln(), powDown(), simulateBalancerSwap(), toBigInt(), defaultRates() (+14 more)

### Community 11 - "Community 11"
Cohesion: 0.12
Nodes (11): routeKeyFromEdges(), colorize(), formatLogs(), formatStatus(), normalizeOpportunity(), pad(), renderFrame(), section() (+3 more)

### Community 12 - "Community 12"
Cohesion: 0.11
Nodes (18): assessmentNetProfit(), assessRouteResult(), compareAssessmentProfit(), getAssessmentOptimizationOptions(), getOptimizationOptions(), minProfitInTokenUnits(), applySlippage(), ceilDiv() (+10 more)

### Community 13 - "Community 13"
Cohesion: 0.14
Nodes (16): addPoolEdges(), buildGraph(), buildHubGraph(), createSwapEdge(), deserializeTopology(), getFeeBps(), getLiveStateRef(), getProtocolKind() (+8 more)

### Community 14 - "Community 14"
Cohesion: 0.2
Nodes (11): NonceManager, clearTrackedReceipt(), dryRun(), logFailure(), pollPendingReceipts(), pollTrackedReceipt(), sendTx(), sendTxBundle() (+3 more)

### Community 15 - "Community 15"
Cohesion: 0.21
Nodes (16): divRoundingUp(), mulDiv(), mulDivRoundingUp(), getAmount0Delta(), getAmount1Delta(), getNextSqrtPriceFromAmount0RoundingUp(), getNextSqrtPriceFromAmount1RoundingDown(), getNextSqrtPriceFromInput() (+8 more)

### Community 16 - "Community 16"
Cohesion: 0.14
Nodes (8): evaluateCandidatePipeline(), selectOptimizationCandidates(), shouldOptimizeCandidate(), estimateGasCostWei(), gasCostInStartTokenUnits(), rankRoutes(), scoreRoute(), selectBestRoute()

### Community 17 - "Community 17"
Cohesion: 0.38
Nodes (2): RegistryMetaCache, loadPoolMetaCache()

## Knowledge Gaps
- **Thin community `Community 17`** (7 nodes): `RegistryMetaCache`, `.constructor()`, `.get()`, `.getActive()`, `.getAll()`, `loadPoolMetaCache()`, `._getPoolMetaCache()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `RegistryService` connect `Community 0` to `Community 1`, `Community 2`, `Community 3`, `Community 9`, `Community 17`?**
  _High betweenness centrality (0.105) - this node is a cross-community bridge._
- **Why does `log()` connect `Community 2` to `Community 0`, `Community 3`, `Community 6`, `Community 9`, `Community 12`, `Community 14`?**
  _High betweenness centrality (0.095) - this node is a cross-community bridge._
- **Why does `refreshCycles()` connect `Community 3` to `Community 1`, `Community 2`, `Community 4`, `Community 6`, `Community 11`, `Community 13`?**
  _High betweenness centrality (0.057) - this node is a cross-community bridge._
- **Are the 27 inferred relationships involving `log()` (e.g. with `fetchAllLogs()` and `enrichDiscoveredPools()`) actually correct?**
  _`log()` has 27 INFERRED edges - model-reasoned connections that need verification._
- **Are the 13 inferred relationships involving `discoverProtocol()` (e.g. with `.getCheckpoint()` and `.getPoolCountForProtocol()`) actually correct?**
  _`discoverProtocol()` has 13 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.04 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._