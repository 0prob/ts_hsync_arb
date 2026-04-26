# Graph Report - t  (2026-04-26)

## Corpus Check
- 162 files · ~95,022 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1024 nodes · 2388 edges · 21 communities detected
- Extraction: 73% EXTRACTED · 27% INFERRED · 0% AMBIGUOUS · INFERRED: 634 edges (avg confidence: 0.8)
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
1. `get()` - 69 edges
2. `RegistryService` - 61 edges
3. `StateWatcher` - 30 edges
4. `log()` - 24 edges
5. `normalizeProtocolKey()` - 24 edges
6. `normalizeEvmAddress()` - 20 edges
7. `WorkerPool` - 20 edges
8. `discoverProtocol()` - 19 edges
9. `RpcManager` - 18 edges
10. `PriceOracle` - 17 edges

## Surprising Connections (you probably didn't know these)
- `withFakeEndpoints()` --calls--> `stop()`  [INFERRED]
  scripts/test_rpc_retry.ts → src/state/poller_base.ts
- `log()` --calls--> `positiveLog()`  [INFERRED]
  runner.ts → src/routing/finder.ts
- `log()` --calls--> `edgeSpotLogWeight()`  [INFERRED]
  runner.ts → src/routing/finder.ts
- `log()` --calls--> `_completePass()`  [INFERRED]
  runner.ts → src/state/poller_base.ts
- `log()` --calls--> `_storeBatchResults()`  [INFERRED]
  runner.ts → src/state/poller_base.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.06
Nodes (42): mergeStateIntoCache(), reloadCacheFromRegistry(), getLiveStateRef(), scoreForCandidate(), getPathFreshness(), normalisePoolAddress(), _completePass(), _storeBatchResults() (+34 more)

### Community 1 - "Community 1"
Cohesion: 0.05
Nodes (56): isBalancerProtocol(), isCurveProtocol(), isSwapExecutionProtocol(), isV2Protocol(), isV3Protocol(), normalizeProtocolKey(), defaultRatesForDecimals(), normalizeBalancerState() (+48 more)

### Community 2 - "Community 2"
Cohesion: 0.03
Nodes (23): evaluateCandidatePipeline(), recordAssessmentReject(), parsePositiveInteger(), parseRunnerArgs(), seedNewPoolsIntoStateCache(), partitionFreshCandidates(), classifyWatcherHaltReason(), recordWatcherHalt() (+15 more)

### Community 3 - "Community 3"
Cohesion: 0.06
Nodes (44): toFiniteNumber(), takeTopNBy(), enumerateCycles(), enumerateCyclesDual(), enumerateCyclesForToken(), normalizePathBudget(), pruneByLiquidity(), resolvePhaseBudget() (+36 more)

### Community 4 - "Community 4"
Cohesion: 0.05
Nodes (48): createHypersyncClient(), createHypersyncConfigError(), createUnavailableHypersyncClient(), createUnsupportedHypersyncError(), normalizeHypersyncClientConfig(), throwUnsupportedHypersync(), UnsupportedDecoder, decode() (+40 more)

### Community 5 - "Community 5"
Cohesion: 0.05
Nodes (44): discoverCurveListedFactory(), lowerCaseAddressList(), mapArbHistoryRow(), mapPoolMetaRow(), mapPoolRow(), mapStalePoolRow(), normalizeAddress(), normalizeAddressList() (+36 more)

### Community 6 - "Community 6"
Cohesion: 0.05
Nodes (43): exp(), getBalancerAmountIn(), getBalancerAmountOut(), ln(), powDown(), simulateBalancerSwap(), toBigInt(), defaultRates() (+35 more)

### Community 7 - "Community 7"
Cohesion: 0.06
Nodes (45): assertValidRouteForExecution(), buildArbTx(), buildTransferTx(), gasEstimateCacheKeyForRoute(), resolveFlashLoan(), buildFlashParams(), callbackProtocolId(), computeRouteHash() (+37 more)

### Community 8 - "Community 8"
Cohesion: 0.07
Nodes (30): fetchGasPrice(), executeWithRpcRetry(), isEndpointCapabilityError(), _isMethodUnavailableError(), isRateLimitError(), isRetryableError(), lazyMetrics(), observeRpcLatency() (+22 more)

### Community 9 - "Community 9"
Cohesion: 0.07
Nodes (25): detectReorg(), pick(), MockHypersyncClient, chunk(), classifyWatcherPollError(), compareRollbackGuards(), dedupeWatcherLogs(), isRollbackGuardMismatchError() (+17 more)

### Community 10 - "Community 10"
Cohesion: 0.07
Nodes (36): assessmentNetProfit(), assessRouteResult(), compareAssessmentProfit(), getAssessmentOptimizationOptions(), getOptimizationOptions(), minProfitInTokenUnits(), applySlippage(), bigintToApproxNumber() (+28 more)

### Community 11 - "Community 11"
Cohesion: 0.05
Nodes (7): discoverPools(), discoverPoolsWithDeps(), validateAllPools(), RegistryService, runValidation(), persistWatcherState(), persistWatcherStates()

### Community 12 - "Community 12"
Cohesion: 0.07
Nodes (10): getBalancerTokens(), normalizeAddressList(), enrichTokens(), getCurveTokens(), discoverStartIndex(), metadataFactoryIndex(), enrichTokens(), normalizeCurveTokenList() (+2 more)

### Community 13 - "Community 13"
Cohesion: 0.2
Nodes (13): NonceManager, classifySubmissionError(), clearTrackedReceipt(), dryRun(), logFailure(), mapWithConcurrency(), pollPendingReceipts(), pollTrackedReceipt() (+5 more)

### Community 14 - "Community 14"
Cohesion: 0.17
Nodes (18): jsonRpc(), polygonPrivateMempoolHeaders(), privateMempoolSupportsBundles(), racePublicRPCs(), rpcShortUrl(), sendBundleAlchemy(), sendPolygonPrivateTransaction(), sendPrivateBundle() (+10 more)

### Community 15 - "Community 15"
Cohesion: 0.21
Nodes (17): divRoundingUp(), mulDiv(), mulDivRoundingUp(), getAmount0Delta(), getAmount1Delta(), getNextSqrtPriceFromAmount0RoundingUp(), getNextSqrtPriceFromAmount1RoundingDown(), getNextSqrtPriceFromInput() (+9 more)

### Community 16 - "Community 16"
Cohesion: 0.12
Nodes (5): routeKeyFromEdges(), clearGasEstimateCache(), hasValidPoolEdges(), profitFromResult(), RouteCache

### Community 17 - "Community 17"
Cohesion: 0.21
Nodes (13): appendCapturedLog(), colorize(), formatLastPass(), formatLogs(), formatStatus(), installOutputGuard(), normalizeOpportunity(), pad() (+5 more)

### Community 18 - "Community 18"
Cohesion: 0.22
Nodes (8): buildDiscoveredPoolBatch(), compareDiscoveryOrder(), normalizeDiscoveryMetadata(), compareHyperSyncLogs(), hyperSyncLogIdentityKey(), normalizeHyperSyncLogInteger(), normalizeHyperSyncLogMeta(), topicArrayFromHyperSyncLog()

### Community 19 - "Community 19"
Cohesion: 0.2
Nodes (2): normalizeChangedPools(), normalizePoolAddressLike()

### Community 20 - "Community 20"
Cohesion: 0.38
Nodes (3): fetchAbi(), fetchAbiWithRetry(), sleep()

## Knowledge Gaps
- **Thin community `Community 19`** (12 nodes): `normalizeChangedPools()`, `normalizeEventPayload()`, `normalizePoolAddressLike()`, `normalizeReorgBlock()`, `configureWatcherCallbacks()`, `createArbScheduler()`, `createShutdownHandler()`, `errorMessage()`, `test_coordinator.ts`, `test_event_bridge.ts`, `lifecycle.ts`, `events.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `RegistryService` connect `Community 11` to `Community 0`, `Community 2`, `Community 4`, `Community 5`, `Community 9`, `Community 16`?**
  _High betweenness centrality (0.070) - this node is a cross-community bridge._
- **Why does `StateWatcher` connect `Community 9` to `Community 0`, `Community 1`, `Community 4`, `Community 11`, `Community 16`?**
  _High betweenness centrality (0.053) - this node is a cross-community bridge._
- **Why does `log()` connect `Community 2` to `Community 0`, `Community 3`, `Community 4`, `Community 5`, `Community 6`, `Community 11`, `Community 13`, `Community 14`, `Community 18`?**
  _High betweenness centrality (0.042) - this node is a cross-community bridge._
- **Are the 68 inferred relationships involving `get()` (e.g. with `fetchAllLogsWithClient()` and `getDiscoveryQuerySpec()`) actually correct?**
  _`get()` has 68 INFERRED edges - model-reasoned connections that need verification._
- **Are the 20 inferred relationships involving `log()` (e.g. with `positiveLog()` and `edgeSpotLogWeight()`) actually correct?**
  _`log()` has 20 INFERRED edges - model-reasoned connections that need verification._
- **Are the 18 inferred relationships involving `normalizeProtocolKey()` (e.g. with `protocolSupportsRouting()` and `getProtocolKind()`) actually correct?**
  _`normalizeProtocolKey()` has 18 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._