# Graph Report - t  (2026-04-27)

## Corpus Check
- 178 files · ~108,439 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1138 nodes · 2740 edges · 21 communities detected
- Extraction: 74% EXTRACTED · 26% INFERRED · 0% AMBIGUOUS · INFERRED: 700 edges (avg confidence: 0.8)
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
3. `StateWatcher` - 32 edges
4. `normalizeProtocolKey()` - 29 edges
5. `log()` - 25 edges
6. `normalizeEvmAddress()` - 25 edges
7. `WorkerPool` - 20 edges
8. `discoverProtocol()` - 20 edges
9. `RpcManager` - 18 edges
10. `throttledMap()` - 18 edges

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
Cohesion: 0.03
Nodes (57): getBalancerTokens(), normalizeAddressList(), enrichTokens(), createHypersyncClient(), createHypersyncConfigError(), createUnavailableHypersyncClient(), createUnsupportedHypersyncError(), normalizeHypersyncClientConfig() (+49 more)

### Community 1 - "Community 1"
Cohesion: 0.05
Nodes (46): mergeStateIntoCache(), getLiveStateRef(), getRoutablePoolContext(), NonceManager, scoreForCandidate(), isAlgebraPool(), _completePass(), _storeBatchResults() (+38 more)

### Community 2 - "Community 2"
Cohesion: 0.05
Nodes (52): isBalancerProtocol(), isCurveProtocol(), isDodoProtocol(), isSwapExecutionProtocol(), isV2Protocol(), isV3Protocol(), isWoofiProtocol(), normalizeProtocolKey() (+44 more)

### Community 3 - "Community 3"
Cohesion: 0.05
Nodes (55): toFiniteNumber(), takeTopNBy(), enumerateCycles(), enumerateCyclesDual(), enumerateCyclesForToken(), normalizePathBudget(), pruneByLiquidity(), resolvePhaseBudget() (+47 more)

### Community 4 - "Community 4"
Cohesion: 0.04
Nodes (47): reloadCacheFromRegistry(), detectReorg(), pick(), buildDiscoveredPoolBatch(), compareDiscoveryOrder(), normalizeDiscoveryMetadata(), compareHyperSyncLogs(), hyperSyncLogIdentityKey() (+39 more)

### Community 5 - "Community 5"
Cohesion: 0.05
Nodes (51): fetchDodoFeeRates(), fetchDodoPoolState(), fetchMultipleDodoStates(), normalizeFeeResult(), tupleValue(), fetchGasPrice(), executeWithRpcRetry(), isEndpointCapabilityError() (+43 more)

### Community 6 - "Community 6"
Cohesion: 0.05
Nodes (52): hasZeroAddressToken(), isEvmAddress(), parsePoolTokensValue(), checkpointStmt(), rollbackToBlock(), setCheckpoint(), setRollbackGuard(), lowerCaseAddressList() (+44 more)

### Community 7 - "Community 7"
Cohesion: 0.03
Nodes (23): evaluateCandidatePipeline(), recordAssessmentReject(), parsePositiveInteger(), parseRunnerArgs(), seedNewPoolsIntoStateCache(), partitionFreshCandidates(), normalizeCandidateLimit(), selectOptimizationCandidates() (+15 more)

### Community 8 - "Community 8"
Cohesion: 0.07
Nodes (46): absDiff(), calculateBalancerStableInvariant(), divUp(), exp(), getBalancerAmountIn(), getBalancerAmountOut(), getBalancerStableAmountOut(), getScaledBalances() (+38 more)

### Community 9 - "Community 9"
Cohesion: 0.07
Nodes (36): assessmentNetProfit(), assessRouteResult(), compareAssessmentProfit(), getAssessmentOptimizationOptions(), getOptimizationOptions(), minProfitInTokenUnits(), applySlippage(), bigintToApproxNumber() (+28 more)

### Community 10 - "Community 10"
Cohesion: 0.06
Nodes (5): discoverPools(), discoverPoolsWithDeps(), validateAllPools(), RegistryService, runValidation()

### Community 11 - "Community 11"
Cohesion: 0.09
Nodes (29): assertValidRouteForExecution(), buildArbTx(), buildTransferTx(), gasEstimateCacheKeyForRoute(), resolveFlashLoan(), bufferedGasLimit(), capGasFeesToBudget(), clampBigInt() (+21 more)

### Community 12 - "Community 12"
Cohesion: 0.08
Nodes (17): deserializeTopology(), normaliseRouteSegment(), requireRouteAddress(), routeExecutionCacheKey(), routeIdentityFromEdges(), routeIdentityFromSerializedPath(), main(), address() (+9 more)

### Community 13 - "Community 13"
Cohesion: 0.18
Nodes (21): buildFlashParams(), callbackProtocolId(), computeRouteHash(), encodeBalancerHop(), encodeCurveHop(), encodeDodoHop(), encodeDynamicApprovalCall(), encodeExecuteArb() (+13 more)

### Community 14 - "Community 14"
Cohesion: 0.13
Nodes (14): classifyWatcherHaltReason(), recordWatcherHalt(), classifySubmissionError(), clearTrackedReceipt(), dryRun(), logFailure(), mapWithConcurrency(), pollPendingReceipts() (+6 more)

### Community 15 - "Community 15"
Cohesion: 0.11
Nodes (9): routeKeyFromEdges(), clearGasEstimateCache(), stopMetricsServer(), hasValidPoolEdges(), profitFromAssessment(), profitFromResult(), RouteCache, assessedRoute() (+1 more)

### Community 16 - "Community 16"
Cohesion: 0.17
Nodes (18): jsonRpc(), polygonPrivateMempoolHeaders(), privateMempoolSupportsBundles(), racePublicRPCs(), rpcShortUrl(), sendBundleAlchemy(), sendPolygonPrivateTransaction(), sendPrivateBundle() (+10 more)

### Community 17 - "Community 17"
Cohesion: 0.21
Nodes (17): divRoundingUp(), mulDiv(), mulDivRoundingUp(), getAmount0Delta(), getAmount1Delta(), getNextSqrtPriceFromAmount0RoundingUp(), getNextSqrtPriceFromAmount1RoundingDown(), getNextSqrtPriceFromInput() (+9 more)

### Community 18 - "Community 18"
Cohesion: 0.21
Nodes (13): appendCapturedLog(), colorize(), formatLastPass(), formatLogs(), formatStatus(), installOutputGuard(), normalizeOpportunity(), pad() (+5 more)

### Community 19 - "Community 19"
Cohesion: 0.16
Nodes (5): normalizeChangedPools(), normalizePoolAddressLike(), createShutdownHandler(), createShutdownHarness(), ShutdownExit

### Community 20 - "Community 20"
Cohesion: 0.38
Nodes (3): fetchAbi(), fetchAbiWithRetry(), sleep()

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `RegistryService` connect `Community 10` to `Community 0`, `Community 1`, `Community 4`, `Community 6`, `Community 7`, `Community 15`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._
- **Why does `get()` connect `Community 1` to `Community 0`, `Community 3`, `Community 4`, `Community 7`, `Community 8`, `Community 11`, `Community 15`, `Community 17`?**
  _High betweenness centrality (0.041) - this node is a cross-community bridge._
- **Why does `WorkerPool` connect `Community 12` to `Community 8`, `Community 1`, `Community 15`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **Are the 68 inferred relationships involving `get()` (e.g. with `fetchAllLogsWithClient()` and `getDiscoveryQuerySpec()`) actually correct?**
  _`get()` has 68 INFERRED edges - model-reasoned connections that need verification._
- **Are the 21 inferred relationships involving `normalizeProtocolKey()` (e.g. with `protocolSupportsRouting()` and `getProtocolKind()`) actually correct?**
  _`normalizeProtocolKey()` has 21 INFERRED edges - model-reasoned connections that need verification._
- **Are the 21 inferred relationships involving `log()` (e.g. with `positiveLog()` and `edgeSpotLogWeight()`) actually correct?**
  _`log()` has 21 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.03 - nodes in this community are weakly interconnected._