# Graph Report - t  (2026-04-27)

## Corpus Check
- 184 files · ~116,349 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1206 nodes · 2919 edges · 21 communities detected
- Extraction: 75% EXTRACTED · 25% INFERRED · 0% AMBIGUOUS · INFERRED: 730 edges (avg confidence: 0.8)
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
3. `normalizeEvmAddress()` - 34 edges
4. `StateWatcher` - 32 edges
5. `normalizeProtocolKey()` - 32 edges
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
- `getRouteFreshnessForHarness()` --calls--> `getPathFreshness()`  [INFERRED]
  scripts/test_engine_e2e.ts → src/routing/path_freshness.ts
- `log()` --calls--> `_completePass()`  [INFERRED]
  runner.ts → src/state/poller_base.ts
- `log()` --calls--> `_storeBatchResults()`  [INFERRED]
  runner.ts → src/state/poller_base.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.02
Nodes (58): assessmentNetProfit(), assessRouteResult(), compareAssessmentProfit(), getAssessmentOptimizationOptions(), getOptimizationOptions(), minProfitInTokenUnits(), evaluateCandidatePipeline(), recordAssessmentReject() (+50 more)

### Community 1 - "Community 1"
Cohesion: 0.04
Nodes (60): mergeStateIntoCache(), reloadCacheFromRegistry(), buildPoolEdgeSnapshot(), getLiveStateRef(), RoutingGraph, NonceManager, scoreForCandidate(), getPathFreshness() (+52 more)

### Community 2 - "Community 2"
Cohesion: 0.03
Nodes (41): discoverCurveListedFactory(), discoverPools(), discoverPoolsWithDeps(), checkpointStmt(), getCheckpoint(), rollbackToBlock(), setCheckpoint(), setRollbackGuard() (+33 more)

### Community 3 - "Community 3"
Cohesion: 0.05
Nodes (58): isBalancerProtocol(), isCurveProtocol(), isDodoProtocol(), isSwapExecutionProtocol(), isV2Protocol(), isV3Protocol(), isWoofiProtocol(), normalizeProtocolKey() (+50 more)

### Community 4 - "Community 4"
Cohesion: 0.05
Nodes (53): fetchDodoFeeRates(), fetchDodoPoolState(), fetchMultipleDodoStates(), normalizeFeeResult(), tupleValue(), estimateGas(), fetchGasPrice(), executeWithRpcRetry() (+45 more)

### Community 5 - "Community 5"
Cohesion: 0.04
Nodes (56): createHypersyncClient(), createHypersyncConfigError(), createUnavailableHypersyncClient(), createUnsupportedHypersyncError(), normalizeHypersyncClientConfig(), normalizeOptionalClientInteger(), throwUnsupportedHypersync(), UnsupportedDecoder (+48 more)

### Community 6 - "Community 6"
Cohesion: 0.05
Nodes (43): detectReorg(), pick(), MockHypersyncClient, persistStates(), chunk(), classifyWatcherPollError(), compareRollbackGuards(), dedupeWatcherLogs() (+35 more)

### Community 7 - "Community 7"
Cohesion: 0.06
Nodes (44): toFiniteNumber(), takeTopNBy(), enumerateCycles(), enumerateCyclesDual(), enumerateCyclesForToken(), normalizePathBudget(), pruneByLiquidity(), resolvePhaseBudget() (+36 more)

### Community 8 - "Community 8"
Cohesion: 0.06
Nodes (44): assertValidRouteForExecution(), buildArbTx(), buildTransferTx(), gasEstimateCacheKeyForRoute(), resolveFlashLoan(), bufferedGasLimit(), capGasFeesToBudget(), clampBigInt() (+36 more)

### Community 9 - "Community 9"
Cohesion: 0.06
Nodes (29): defaultRates(), getCurveAmountIn(), getCurveAmountOut(), getD(), getY(), hasValidCurveIndexes(), simulateCurveSwap(), toBigIntArray() (+21 more)

### Community 10 - "Community 10"
Cohesion: 0.05
Nodes (13): getBalancerTokens(), normalizeAddressList(), enrichTokens(), getCurveTokens(), discoverStartIndex(), metadataFactoryIndex(), enrichTokens(), normalizeCurveTokenList() (+5 more)

### Community 11 - "Community 11"
Cohesion: 0.1
Nodes (34): divCeil(), divFloor(), generalIntegrate(), getDodoAmountOut(), getDodoGrossAmountOut(), mulFloor(), reciprocalFloor(), simulateDodoSwap() (+26 more)

### Community 12 - "Community 12"
Cohesion: 0.08
Nodes (11): routeKeyFromEdges(), clearGasEstimateCache(), classifyWatcherHaltReason(), recordWatcherHalt(), stopMetricsServer(), hasValidPoolEdges(), profitFromAssessment(), profitFromResult() (+3 more)

### Community 13 - "Community 13"
Cohesion: 0.18
Nodes (21): buildFlashParams(), callbackProtocolId(), computeRouteHash(), encodeBalancerHop(), encodeCurveHop(), encodeDodoHop(), encodeDynamicApprovalCall(), encodeExecuteArb() (+13 more)

### Community 14 - "Community 14"
Cohesion: 0.15
Nodes (22): isAlreadyKnownSubmission(), jsonRpc(), polygonPrivateMempoolHeaders(), privateMempoolSupportsBundles(), racePublicRPCs(), rpcShortUrl(), sendBundleAlchemy(), sendPolygonPrivateTransaction() (+14 more)

### Community 15 - "Community 15"
Cohesion: 0.18
Nodes (19): divRoundingUp(), mulDiv(), mulDivRoundingUp(), getAmount0Delta(), getAmount1Delta(), getNextSqrtPriceFromAmount0RoundingUp(), getNextSqrtPriceFromAmount1RoundingDown(), getNextSqrtPriceFromInput() (+11 more)

### Community 16 - "Community 16"
Cohesion: 0.18
Nodes (17): appendCapturedLog(), capCapturedText(), colorize(), formatLastPass(), formatLogs(), formatStatus(), frameWidth(), installOutputGuard() (+9 more)

### Community 17 - "Community 17"
Cohesion: 0.25
Nodes (13): absDiff(), calculateBalancerStableInvariant(), divUp(), exp(), getBalancerAmountIn(), getBalancerAmountOut(), getBalancerStableAmountOut(), getScaledBalances() (+5 more)

### Community 18 - "Community 18"
Cohesion: 0.27
Nodes (16): lowerCaseAddressList(), mapArbHistoryRow(), mapPoolMetaRow(), mapPoolRow(), mapStalePoolRow(), normalizeAddress(), normalizeAddressList(), parseJson() (+8 more)

### Community 19 - "Community 19"
Cohesion: 0.16
Nodes (5): normalizeChangedPools(), normalizePoolAddressLike(), createShutdownHandler(), createShutdownHarness(), ShutdownExit

### Community 20 - "Community 20"
Cohesion: 0.38
Nodes (3): fetchAbi(), fetchAbiWithRetry(), sleep()

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `RegistryService` connect `Community 2` to `Community 1`, `Community 5`, `Community 6`, `Community 11`, `Community 12`?**
  _High betweenness centrality (0.043) - this node is a cross-community bridge._
- **Why does `log()` connect `Community 11` to `Community 0`, `Community 1`, `Community 2`, `Community 4`, `Community 5`, `Community 9`, `Community 14`?**
  _High betweenness centrality (0.038) - this node is a cross-community bridge._
- **Why does `StateWatcher` connect `Community 6` to `Community 1`, `Community 3`, `Community 12`, `Community 5`?**
  _High betweenness centrality (0.037) - this node is a cross-community bridge._
- **Are the 68 inferred relationships involving `get()` (e.g. with `fetchAllLogsWithClient()` and `getDiscoveryQuerySpec()`) actually correct?**
  _`get()` has 68 INFERRED edges - model-reasoned connections that need verification._
- **Are the 31 inferred relationships involving `normalizeEvmAddress()` (e.g. with `lookupPoolState()` and `normalisePoolAddress()`) actually correct?**
  _`normalizeEvmAddress()` has 31 INFERRED edges - model-reasoned connections that need verification._
- **Are the 24 inferred relationships involving `normalizeProtocolKey()` (e.g. with `protocolSupportsRouting()` and `getProtocolKind()`) actually correct?**
  _`normalizeProtocolKey()` has 24 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.02 - nodes in this community are weakly interconnected._