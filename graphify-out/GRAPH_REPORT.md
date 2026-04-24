# Graph Report - t  (2026-04-23)

## Corpus Check
- 161 files · ~160,533 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 877 nodes · 1974 edges · 20 communities detected
- Extraction: 69% EXTRACTED · 31% INFERRED · 0% AMBIGUOUS · INFERRED: 619 edges (avg confidence: 0.8)
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

## God Nodes (most connected - your core abstractions)
1. `get()` - 66 edges
2. `RegistryService` - 59 edges
3. `log()` - 35 edges
4. `StateWatcher` - 25 edges
5. `discoverProtocol()` - 23 edges
6. `WorkerPool` - 20 edges
7. `refreshCycles()` - 17 edges
8. `RpcManager` - 17 edges
9. `discoverCurveRemovals()` - 17 edges
10. `main()` - 16 edges

## Surprising Connections (you probably didn't know these)
- `main()` --calls--> `startTui()`  [INFERRED]
  runner.ts → src/tui/index.tsx
- `log()` --calls--> `quoteBasedLogWeight()`  [INFERRED]
  runner.ts → src/routing/finder.ts
- `log()` --calls--> `edgeSpotLogWeight()`  [INFERRED]
  runner.ts → src/routing/finder.ts
- `log()` --calls--> `_completePass()`  [INFERRED]
  runner.ts → /home/x/t/src/state/poller_base.ts
- `log()` --calls--> `_storeBatchResults()`  [INFERRED]
  runner.ts → /home/x/t/src/state/poller_base.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.04
Nodes (36): takeTopNBy(), parsePositiveInteger(), parseRunnerArgs(), partitionFreshCandidates(), clampBigInt(), estimateGas(), fetchEIP1559Fees(), fetchGasPrice() (+28 more)

### Community 1 - "Community 1"
Cohesion: 0.07
Nodes (31): mergeStateIntoCache(), recommendGasParams(), getLiveStateRef(), NonceManager, _completePass(), PriceOracle, getPoolFee(), getTokenMeta() (+23 more)

### Community 2 - "Community 2"
Cohesion: 0.06
Nodes (50): reloadCacheFromRegistry(), assetStmt(), batchUpsertTokenMeta(), getTokenDecimals(), normalizeTokenAddress(), normalizeTokenDecimals(), normalizeTokenText(), upsertPoolFee() (+42 more)

### Community 3 - "Community 3"
Cohesion: 0.05
Nodes (33): detectReorg(), pick(), createRegistryStub(), createV2State(), testDetectReorgOnlyComparesMatchingBoundaries(), testWatcherInvalidatesStaleEnrichmentAcrossReorg(), chunk(), classifyWatcherPollError() (+25 more)

### Community 4 - "Community 4"
Cohesion: 0.06
Nodes (35): throwUnsupportedHypersync(), UnsupportedDecoder, discoverCurveListedFactory(), assertDecodedLogsAligned(), buildDiscoveryScanQuery(), decodeDiscoveryLogs(), discoverCurveRemovals(), discoverPools() (+27 more)

### Community 5 - "Community 5"
Cohesion: 0.05
Nodes (43): assessmentNetProfit(), assessRouteResult(), compareAssessmentProfit(), getAssessmentOptimizationOptions(), getOptimizationOptions(), minProfitInTokenUnits(), applySlippage(), bigintToApproxNumber() (+35 more)

### Community 6 - "Community 6"
Cohesion: 0.05
Nodes (29): normalizeBalancerState(), normalizeCurveState(), normalizePoolState(), normalizeV2State(), normalizeV3State(), splitEvenWeights(), fetchAndNormalizeBalancerPool(), fetchBalancerPoolState() (+21 more)

### Community 7 - "Community 7"
Cohesion: 0.07
Nodes (26): enumerateCycles(), enumerateCyclesDual(), enumerateCyclesForToken(), pruneByLiquidity(), resolvePhaseBudget(), selectTopPaths(), sortByLogWeight(), annotatePath() (+18 more)

### Community 8 - "Community 8"
Cohesion: 0.05
Nodes (5): RegistryMetaCache, loadPoolMetaCache(), validateAllPools(), RegistryService, runValidation()

### Community 9 - "Community 9"
Cohesion: 0.06
Nodes (21): fetchAbi(), fetchAbiWithRetry(), sleep(), toFiniteNumber(), decode(), addPoolEdges(), buildGraph(), buildHubGraph() (+13 more)

### Community 10 - "Community 10"
Cohesion: 0.07
Nodes (24): getBalancerTokens(), normalizeAddressList(), enrichTokens(), getCurveTokens(), enrichTokens(), normalizeCurveTokenList(), _num(), _parseSafeNonNegativeConfigNumber() (+16 more)

### Community 11 - "Community 11"
Cohesion: 0.09
Nodes (13): gasEstimateCacheKeyForRoute(), deserializeTopology(), routeExecutionCacheKey(), routeIdentityFromEdges(), routeIdentityFromSerializedPath(), collectChunkPoolAddresses(), getStateVersion(), isUsableSlot() (+5 more)

### Community 12 - "Community 12"
Cohesion: 0.11
Nodes (9): executeWithRpcRetry(), isEndpointCapabilityError(), _isMethodUnavailableError(), isRateLimitError(), isRetryableError(), lazyMetrics(), RpcEndpoint, RpcManager (+1 more)

### Community 13 - "Community 13"
Cohesion: 0.16
Nodes (16): assertValidRouteForExecution(), buildArbTx(), buildTransferTx(), resolveFlashLoan(), buildFlashParams(), callbackProtocolId(), computeRouteHash(), encodeBalancerHop() (+8 more)

### Community 14 - "Community 14"
Cohesion: 0.15
Nodes (13): evaluateCandidatePipeline(), scoreForCandidate(), selectOptimizationCandidates(), shouldOptimizeCandidate(), bigintToApproxNumber(), ceilDiv(), estimateGasCostWei(), gasCostInStartTokenUnits() (+5 more)

### Community 15 - "Community 15"
Cohesion: 0.41
Nodes (10): divRoundingUp(), mulDiv(), mulDivRoundingUp(), getAmount0Delta(), getAmount1Delta(), getNextSqrtPriceFromAmount0RoundingUp(), getNextSqrtPriceFromAmount1RoundingDown(), getNextSqrtPriceFromInput() (+2 more)

### Community 16 - "Community 16"
Cohesion: 0.36
Nodes (10): colorize(), formatLogs(), formatStatus(), normalizeOpportunity(), pad(), renderFrame(), section(), startTui() (+2 more)

### Community 17 - "Community 17"
Cohesion: 0.36
Nodes (9): jsonRpc(), polygonPrivateMempoolHeaders(), privateMempoolSupportsBundles(), racePublicRPCs(), sendBundleAlchemy(), sendPolygonPrivateTransaction(), sendPrivateBundle(), sendPrivateTransaction() (+1 more)

### Community 18 - "Community 18"
Cohesion: 0.31
Nodes (6): configureWatcherCallbacks(), createArbScheduler(), createShutdownHandler(), testSchedulerWaitForIdle(), testShutdownWaitsForOwnedWork(), testWatcherCallbacksScheduleAfterStateWork()

### Community 19 - "Community 19"
Cohesion: 0.44
Nodes (7): exp(), getBalancerAmountIn(), getBalancerAmountOut(), ln(), powDown(), simulateBalancerSwap(), toBigInt()

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `log()` connect `Community 4` to `Community 0`, `Community 1`, `Community 3`, `Community 5`, `Community 6`, `Community 7`, `Community 17`?**
  _High betweenness centrality (0.095) - this node is a cross-community bridge._
- **Why does `RegistryService` connect `Community 8` to `Community 1`, `Community 2`, `Community 3`, `Community 4`, `Community 7`?**
  _High betweenness centrality (0.084) - this node is a cross-community bridge._
- **Why does `executeWithRpcRetry()` connect `Community 12` to `Community 0`, `Community 10`?**
  _High betweenness centrality (0.070) - this node is a cross-community bridge._
- **Are the 65 inferred relationships involving `get()` (e.g. with `selectPendingQuietPools()` and `partitionChangedPools()`) actually correct?**
  _`get()` has 65 INFERRED edges - model-reasoned connections that need verification._
- **Are the 29 inferred relationships involving `log()` (e.g. with `quoteBasedLogWeight()` and `edgeSpotLogWeight()`) actually correct?**
  _`log()` has 29 INFERRED edges - model-reasoned connections that need verification._
- **Are the 17 inferred relationships involving `discoverProtocol()` (e.g. with `getCheckpoint()` and `getPoolCountForProtocol()`) actually correct?**
  _`discoverProtocol()` has 17 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.04 - nodes in this community are weakly interconnected._