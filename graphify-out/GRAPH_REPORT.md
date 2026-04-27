# Graph Report - t  (2026-04-27)

## Corpus Check
- 189 files · ~120,249 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1251 nodes · 3025 edges · 25 communities detected
- Extraction: 75% EXTRACTED · 25% INFERRED · 0% AMBIGUOUS · INFERRED: 742 edges (avg confidence: 0.8)
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
- [[_COMMUNITY_Community 24|Community 24]]

## God Nodes (most connected - your core abstractions)
1. `get()` - 69 edges
2. `RegistryService` - 61 edges
3. `normalizeEvmAddress()` - 36 edges
4. `normalizeProtocolKey()` - 34 edges
5. `StateWatcher` - 32 edges
6. `log()` - 25 edges
7. `RpcManager` - 23 edges
8. `WorkerPool` - 20 edges
9. `recommendGasParams()` - 20 edges
10. `discoverProtocol()` - 20 edges

## Surprising Connections (you probably didn't know these)
- `withFakeEndpoints()` --calls--> `stop()`  [INFERRED]
  scripts/test_rpc_retry.ts → src/state/poller_base.ts
- `woofiState()` --calls--> `normalizePoolState()`  [INFERRED]
  scripts/test_topology_service.ts → src/state/normalizer.ts
- `log()` --calls--> `_completePass()`  [INFERRED]
  runner.ts → src/state/poller_base.ts
- `log()` --calls--> `_storeBatchResults()`  [INFERRED]
  runner.ts → src/state/poller_base.ts
- `log()` --calls--> `discoverCurveListedFactory()`  [INFERRED]
  runner.ts → src/protocols/curve_list_factory.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.02
Nodes (60): assessmentNetProfit(), assessRouteResult(), compareAssessmentProfit(), getAssessmentOptimizationOptions(), getOptimizationOptions(), minProfitInTokenUnits(), evaluateCandidatePipeline(), recordAssessmentReject() (+52 more)

### Community 1 - "Community 1"
Cohesion: 0.05
Nodes (55): mergeStateIntoCache(), reloadCacheFromRegistry(), getDiscoveryQuerySpec(), seedNewPoolsIntoStateCache(), annotatePath(), find2HopPaths(), find3HopPaths(), find4HopPathsBidirectional() (+47 more)

### Community 2 - "Community 2"
Cohesion: 0.04
Nodes (58): createHypersyncClient(), createHypersyncConfigError(), createUnavailableHypersyncClient(), createUnsupportedHypersyncError(), normalizeHypersyncClientConfig(), normalizeOptionalClientInteger(), throwUnsupportedHypersync(), UnsupportedDecoder (+50 more)

### Community 3 - "Community 3"
Cohesion: 0.05
Nodes (36): detectReorg(), pick(), buildDiscoveredPoolBatch(), compareDiscoveryOrder(), normalizeDiscoveryMetadata(), compareHyperSyncLogs(), hyperSyncLogIdentityKey(), normalizeHyperSyncLogInteger() (+28 more)

### Community 4 - "Community 4"
Cohesion: 0.06
Nodes (27): _num(), _parseSafeNonNegativeConfigNumber(), fetchAndNormalizeBalancerPool(), fetchBalancerPoolState(), fetchBalancerStableState(), parsePoolVersion(), PollBalancer, readContractWithTimeout() (+19 more)

### Community 5 - "Community 5"
Cohesion: 0.06
Nodes (49): toFiniteNumber(), takeTopNBy(), enumerateCycles(), enumerateCyclesDual(), enumerateCyclesForToken(), normalizePathBudget(), pruneByLiquidity(), resolvePhaseBudget() (+41 more)

### Community 6 - "Community 6"
Cohesion: 0.07
Nodes (41): isEvmAddress(), lowerCaseAddressList(), mapArbHistoryRow(), mapPoolMetaRow(), mapPoolRow(), mapStalePoolRow(), normalizeAddress(), normalizeAddressList() (+33 more)

### Community 7 - "Community 7"
Cohesion: 0.08
Nodes (48): isBalancerProtocol(), isCurveProtocol(), isDodoProtocol(), isSwapExecutionProtocol(), isV2Protocol(), isV3Protocol(), isWoofiProtocol(), normalizeProtocolKey() (+40 more)

### Community 8 - "Community 8"
Cohesion: 0.05
Nodes (7): stopMetricsServer(), validateAllPools(), RegistryService, CompatDatabase, runValidation(), persistWatcherState(), persistWatcherStates()

### Community 9 - "Community 9"
Cohesion: 0.09
Nodes (46): divCeil(), divFloor(), generalIntegrate(), getDodoAmountOut(), getDodoGrossAmountOut(), mulFloor(), reciprocalFloor(), simulateDodoSwap() (+38 more)

### Community 10 - "Community 10"
Cohesion: 0.08
Nodes (42): enrichDiscoveredPools(), fetchDodoFeeRates(), fetchDodoPoolState(), fetchMultipleDodoStates(), normalizeFeeResult(), tupleValue(), getPoolCountByProtocol(), getPools() (+34 more)

### Community 11 - "Community 11"
Cohesion: 0.07
Nodes (19): estimateGas(), fetchGasPrice(), executeWithRpcRetry(), isEndpointCapabilityError(), isRateLimitError(), isRetryableError(), lazyMetrics(), normalizeRpcMethod() (+11 more)

### Community 12 - "Community 12"
Cohesion: 0.08
Nodes (39): assertValidRouteForExecution(), buildArbTx(), buildTransferTx(), gasEstimateCacheKeyForRoute(), resolveFlashLoan(), bufferedGasLimit(), capGasFeesToBudget(), clampBigInt() (+31 more)

### Community 13 - "Community 13"
Cohesion: 0.06
Nodes (11): getBalancerTokens(), normalizeAddressList(), enrichTokens(), getCurveTokens(), enrichTokens(), normalizeCurveTokenList(), decode(), feePipsFromBps() (+3 more)

### Community 14 - "Community 14"
Cohesion: 0.09
Nodes (35): absDiff(), calculateBalancerStableInvariant(), divUp(), exp(), getBalancerAmountIn(), getBalancerAmountOut(), getBalancerStableAmountOut(), getScaledBalances() (+27 more)

### Community 15 - "Community 15"
Cohesion: 0.08
Nodes (17): deserializeTopology(), normaliseRouteSegment(), requireRouteAddress(), routeExecutionCacheKey(), routeIdentityFromEdges(), routeIdentityFromSerializedPath(), main(), address() (+9 more)

### Community 16 - "Community 16"
Cohesion: 0.17
Nodes (21): buildFlashParams(), callbackProtocolId(), computeRouteHash(), encodeBalancerHop(), encodeCurveHop(), encodeDodoHop(), encodeDynamicApprovalCall(), encodeExecuteArb() (+13 more)

### Community 17 - "Community 17"
Cohesion: 0.18
Nodes (19): divRoundingUp(), mulDiv(), mulDivRoundingUp(), getAmount0Delta(), getAmount1Delta(), getNextSqrtPriceFromAmount0RoundingUp(), getNextSqrtPriceFromAmount1RoundingDown(), getNextSqrtPriceFromInput() (+11 more)

### Community 18 - "Community 18"
Cohesion: 0.18
Nodes (17): appendCapturedLog(), capCapturedText(), colorize(), formatLastPass(), formatLogs(), formatStatus(), frameWidth(), installOutputGuard() (+9 more)

### Community 19 - "Community 19"
Cohesion: 0.13
Nodes (7): clearGasEstimateCache(), hasValidPoolEdges(), profitFromAssessment(), profitFromResult(), RouteCache, assessedRoute(), route()

### Community 20 - "Community 20"
Cohesion: 0.14
Nodes (15): compareDeferredHydrationPriority(), createQuietPoolSweepCoordinator(), createHarness(), createHarness(), pool(), poolWithTokens(), validV3Raw(), zeroLiquidityV3Raw() (+7 more)

### Community 21 - "Community 21"
Cohesion: 0.16
Nodes (5): normalizeChangedPools(), normalizePoolAddressLike(), createShutdownHandler(), createShutdownHarness(), ShutdownExit

### Community 22 - "Community 22"
Cohesion: 0.29
Nodes (12): classifySubmissionError(), clearTrackedReceipt(), dryRun(), logFailure(), mapWithConcurrency(), pollPendingReceipts(), pollTrackedReceipt(), sendTx() (+4 more)

### Community 23 - "Community 23"
Cohesion: 0.27
Nodes (3): addTwoHopCycle(), TestGraph, v2Edge()

### Community 24 - "Community 24"
Cohesion: 0.38
Nodes (3): fetchAbi(), fetchAbiWithRetry(), sleep()

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `StateWatcher` connect `Community 3` to `Community 1`, `Community 2`, `Community 4`, `Community 8`, `Community 19`?**
  _High betweenness centrality (0.046) - this node is a cross-community bridge._
- **Why does `RegistryService` connect `Community 8` to `Community 1`, `Community 2`, `Community 3`, `Community 5`, `Community 6`, `Community 19`?**
  _High betweenness centrality (0.040) - this node is a cross-community bridge._
- **Are the 68 inferred relationships involving `get()` (e.g. with `fetchAllLogsWithClient()` and `getDiscoveryQuerySpec()`) actually correct?**
  _`get()` has 68 INFERRED edges - model-reasoned connections that need verification._
- **Are the 33 inferred relationships involving `normalizeEvmAddress()` (e.g. with `lookupPoolState()` and `normalisePoolAddress()`) actually correct?**
  _`normalizeEvmAddress()` has 33 INFERRED edges - model-reasoned connections that need verification._
- **Are the 26 inferred relationships involving `normalizeProtocolKey()` (e.g. with `protocolSupportsRouting()` and `getProtocolKind()`) actually correct?**
  _`normalizeProtocolKey()` has 26 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.02 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._