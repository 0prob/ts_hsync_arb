# Graph Report - t  (2026-04-27)

## Corpus Check
- 193 files · ~123,743 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1275 nodes · 3064 edges · 24 communities detected
- Extraction: 76% EXTRACTED · 24% INFERRED · 0% AMBIGUOUS · INFERRED: 750 edges (avg confidence: 0.8)
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
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]

## God Nodes (most connected - your core abstractions)
1. `get()` - 69 edges
2. `RegistryService` - 61 edges
3. `normalizeEvmAddress()` - 38 edges
4. `normalizeProtocolKey()` - 34 edges
5. `StateWatcher` - 32 edges
6. `log()` - 26 edges
7. `RpcManager` - 23 edges
8. `WorkerPool` - 20 edges
9. `recommendGasParams()` - 20 edges
10. `throttledMap()` - 20 edges

## Surprising Connections (you probably didn't know these)
- `testThrottledMapClampsZeroConcurrency()` --calls--> `throttledMap()`  [INFERRED]
  scripts/test_rpc_retry.ts → src/enrichment/rpc.ts
- `woofiState()` --calls--> `normalizePoolState()`  [INFERRED]
  scripts/test_topology_service.ts → src/state/normalizer.ts
- `getRouteFreshnessForHarness()` --calls--> `getPathFreshness()`  [INFERRED]
  scripts/test_engine_e2e.ts → src/routing/path_freshness.ts
- `log()` --calls--> `main()`  [INFERRED]
  runner.ts → scripts/tune_performance.ts
- `log()` --calls--> `positiveLog()`  [INFERRED]
  runner.ts → src/routing/finder.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.04
Nodes (73): toFiniteNumber(), mergeStateIntoCache(), reloadCacheFromRegistry(), discoverCurveRemovals(), getDiscoveryQuerySpec(), seedNewPoolsIntoStateCache(), annotatePath(), compareByPathLogWeight() (+65 more)

### Community 1 - "Community 1"
Cohesion: 0.02
Nodes (60): assessmentNetProfit(), assessRouteResult(), compareAssessmentProfit(), getAssessmentOptimizationOptions(), getOptimizationOptions(), minProfitInTokenUnits(), gasEstimateCacheKeyForRoute(), evaluateCandidatePipeline() (+52 more)

### Community 2 - "Community 2"
Cohesion: 0.03
Nodes (69): fetchDodoFeeRates(), fetchDodoPoolState(), fetchMultipleDodoStates(), normalizeFeeResult(), tupleValue(), _num(), _parseSafeNonNegativeConfigNumber(), _port() (+61 more)

### Community 3 - "Community 3"
Cohesion: 0.04
Nodes (31): getBalancerTokens(), normalizeAddressList(), enrichTokens(), decode(), discover(), getCurveTokens(), discoverCurveListedFactory(), discoverFactoryIndexesToScan() (+23 more)

### Community 4 - "Community 4"
Cohesion: 0.05
Nodes (50): isEvmAddress(), checkpointStmt(), rollbackToBlock(), setCheckpoint(), setRollbackGuard(), lowerCaseAddressList(), mapArbHistoryRow(), mapPoolMetaRow() (+42 more)

### Community 5 - "Community 5"
Cohesion: 0.06
Nodes (34): estimateGas(), fetchGasPrice(), stop(), executeWithRpcRetry(), isEndpointCapabilityError(), isRateLimitError(), isRetryableError(), lazyMetrics() (+26 more)

### Community 6 - "Community 6"
Cohesion: 0.06
Nodes (38): detectReorg(), pick(), buildDiscoveredPoolBatch(), compareDiscoveryOrder(), normalizeDiscoveryMetadata(), compareHyperSyncLogs(), hyperSyncLogIdentityKey(), normalizeHyperSyncLogInteger() (+30 more)

### Community 7 - "Community 7"
Cohesion: 0.07
Nodes (45): buildArbTx(), buildTransferTx(), resolveFlashLoan(), buildFlashParams(), callbackProtocolId(), computeRouteHash(), encodeBalancerHop(), encodeCurveHop() (+37 more)

### Community 8 - "Community 8"
Cohesion: 0.07
Nodes (45): absDiff(), calculateBalancerStableInvariant(), divUp(), exp(), getBalancerAmountIn(), getBalancerAmountOut(), getBalancerStableAmountOut(), getScaledBalances() (+37 more)

### Community 9 - "Community 9"
Cohesion: 0.05
Nodes (8): discoverPools(), discoverPoolsWithDeps(), discoveryProtocolCoverage(), validateAllPools(), RegistryService, runValidation(), persistWatcherState(), persistWatcherStates()

### Community 10 - "Community 10"
Cohesion: 0.1
Nodes (37): defaultRatesForDecimals(), normalizeBalancerState(), normalizeBigIntList(), normalizeCurveState(), normalizeDodoState(), normalizePoolState(), normalizeStateAddress(), normalizeStateTokenList() (+29 more)

### Community 11 - "Community 11"
Cohesion: 0.11
Nodes (38): assertValidRouteForExecution(), isBalancerProtocol(), isCurveProtocol(), isDodoProtocol(), isSwapExecutionProtocol(), isV2Protocol(), isV3Protocol(), isWoofiProtocol() (+30 more)

### Community 12 - "Community 12"
Cohesion: 0.09
Nodes (25): takeTopNBy(), enumerateCycles(), enumerateCyclesDual(), enumerateCyclesForToken(), normalizePathBudget(), pruneByLiquidity(), resolvePhaseBudget(), selectTopPaths() (+17 more)

### Community 13 - "Community 13"
Cohesion: 0.07
Nodes (19): deserializeTopology(), normaliseRouteSegment(), requireRouteAddress(), routeExecutionCacheKey(), routeIdentityFromEdges(), routeIdentityFromSerializedPath(), main(), evaluatePaths() (+11 more)

### Community 14 - "Community 14"
Cohesion: 0.09
Nodes (27): createHypersyncClient(), createHypersyncConfigError(), createUnavailableHypersyncClient(), createUnsupportedHypersyncError(), normalizeHypersyncClientConfig(), normalizeOptionalClientInteger(), throwUnsupportedHypersync(), UnsupportedDecoder (+19 more)

### Community 15 - "Community 15"
Cohesion: 0.1
Nodes (16): classifyWatcherHaltReason(), recordWatcherHalt(), startMetricsServer(), classifySubmissionError(), clearTrackedReceipt(), dryRun(), logFailure(), mapWithConcurrency() (+8 more)

### Community 16 - "Community 16"
Cohesion: 0.15
Nodes (22): isAlreadyKnownSubmission(), jsonRpc(), polygonPrivateMempoolHeaders(), privateMempoolSupportsBundles(), racePublicRPCs(), rpcShortUrl(), sendBundleAlchemy(), sendPolygonPrivateTransaction() (+14 more)

### Community 17 - "Community 17"
Cohesion: 0.18
Nodes (19): divRoundingUp(), mulDiv(), mulDivRoundingUp(), getAmount0Delta(), getAmount1Delta(), getNextSqrtPriceFromAmount0RoundingUp(), getNextSqrtPriceFromAmount1RoundingDown(), getNextSqrtPriceFromInput() (+11 more)

### Community 18 - "Community 18"
Cohesion: 0.11
Nodes (8): clearGasEstimateCache(), stopMetricsServer(), hasValidPoolEdges(), profitFromAssessment(), profitFromResult(), RouteCache, assessedRoute(), route()

### Community 19 - "Community 19"
Cohesion: 0.14
Nodes (15): compareDeferredHydrationPriority(), createQuietPoolSweepCoordinator(), createHarness(), createHarness(), pool(), poolWithTokens(), validV3Raw(), zeroLiquidityV3Raw() (+7 more)

### Community 20 - "Community 20"
Cohesion: 0.14
Nodes (5): latestEvent(), latestMatch(), logSeverityCounts(), normalizeLogLine(), signalSummary()

### Community 21 - "Community 21"
Cohesion: 0.16
Nodes (5): normalizeChangedPools(), normalizePoolAddressLike(), createShutdownHandler(), createShutdownHarness(), ShutdownExit

### Community 22 - "Community 22"
Cohesion: 0.39
Nodes (7): buildPerformanceProfile(), clamp(), main(), normalizeProfileName(), parseArgs(), roundGb(), writePerformanceProfile()

### Community 23 - "Community 23"
Cohesion: 0.38
Nodes (3): fetchAbi(), fetchAbiWithRetry(), sleep()

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `log()` connect `Community 1` to `Community 0`, `Community 2`, `Community 3`, `Community 6`, `Community 9`, `Community 13`, `Community 14`, `Community 16`, `Community 22`?**
  _High betweenness centrality (0.073) - this node is a cross-community bridge._
- **Why does `RegistryService` connect `Community 9` to `Community 0`, `Community 1`, `Community 2`, `Community 3`, `Community 4`, `Community 6`, `Community 18`?**
  _High betweenness centrality (0.042) - this node is a cross-community bridge._
- **Why does `main()` connect `Community 22` to `Community 1`?**
  _High betweenness centrality (0.035) - this node is a cross-community bridge._
- **Are the 68 inferred relationships involving `get()` (e.g. with `fetchAllLogsWithClient()` and `getDiscoveryQuerySpec()`) actually correct?**
  _`get()` has 68 INFERRED edges - model-reasoned connections that need verification._
- **Are the 35 inferred relationships involving `normalizeEvmAddress()` (e.g. with `lookupPoolState()` and `normalisePoolAddress()`) actually correct?**
  _`normalizeEvmAddress()` has 35 INFERRED edges - model-reasoned connections that need verification._
- **Are the 26 inferred relationships involving `normalizeProtocolKey()` (e.g. with `protocolSupportsRouting()` and `getProtocolKind()`) actually correct?**
  _`normalizeProtocolKey()` has 26 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.04 - nodes in this community are weakly interconnected._