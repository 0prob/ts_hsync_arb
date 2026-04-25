# Graph Report - t  (2026-04-25)

## Corpus Check
- 140 files · ~150,579 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 900 nodes · 1931 edges · 17 communities detected
- Extraction: 78% EXTRACTED · 22% INFERRED · 0% AMBIGUOUS · INFERRED: 427 edges (avg confidence: 0.8)
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

## God Nodes (most connected - your core abstractions)
1. `RegistryService` - 61 edges
2. `StateWatcher` - 27 edges
3. `log()` - 23 edges
4. `normalizeProtocolKey()` - 23 edges
5. `WorkerPool` - 20 edges
6. `RpcManager` - 17 edges
7. `PriceOracle` - 16 edges
8. `executeWithRpcRetry()` - 15 edges
9. `discoverProtocol()` - 14 edges
10. `normalizeEvmAddress()` - 14 edges

## Surprising Connections (you probably didn't know these)
- `log()` --calls--> `fetchAllLogsWithClient()`  [INFERRED]
  runner.ts → src/hypersync/paginate.ts
- `log()` --calls--> `enrichDiscoveredPools()`  [INFERRED]
  runner.ts → src/discovery/discover.ts
- `log()` --calls--> `discoverProtocol()`  [INFERRED]
  runner.ts → src/discovery/discover.ts
- `log()` --calls--> `discoverCurveRemovals()`  [INFERRED]
  runner.ts → src/discovery/discover.ts
- `log()` --calls--> `discoverPoolsWithDeps()`  [INFERRED]
  runner.ts → src/discovery/discover.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.03
Nodes (38): mergeStateIntoCache(), reloadCacheFromRegistry(), detectReorg(), pick(), discoverPools(), discoverPoolsWithDeps(), RegistryService, runValidation() (+30 more)

### Community 1 - "Community 1"
Cohesion: 0.03
Nodes (45): assessmentNetProfit(), assessRouteResult(), compareAssessmentProfit(), getAssessmentOptimizationOptions(), getOptimizationOptions(), minProfitInTokenUnits(), gasEstimateCacheKeyForRoute(), parsePositiveInteger() (+37 more)

### Community 2 - "Community 2"
Cohesion: 0.04
Nodes (70): isEvmAddress(), normalizeEvmAddress(), assetStmt(), batchUpsertTokenMeta(), getPoolFee(), getTokenDecimals(), getTokenMeta(), normalizePoolAddress() (+62 more)

### Community 3 - "Community 3"
Cohesion: 0.04
Nodes (32): throwUnsupportedHypersync(), UnsupportedDecoder, discover(), discoverCurveListedFactory(), discoverStartIndex(), metadataFactoryIndex(), discover(), assertDecodedLogsAligned() (+24 more)

### Community 4 - "Community 4"
Cohesion: 0.05
Nodes (43): toFiniteNumber(), takeTopNBy(), seedNewPoolsIntoStateCache(), enumerateCycles(), enumerateCyclesDual(), enumerateCyclesForToken(), pruneByLiquidity(), resolvePhaseBudget() (+35 more)

### Community 5 - "Community 5"
Cohesion: 0.05
Nodes (22): clearGasEstimateCache(), classifyWatcherHaltReason(), recordWatcherHalt(), stopMetricsServer(), NonceManager, PriceOracle, hasValidPoolEdges(), normalisePoolAddress() (+14 more)

### Community 6 - "Community 6"
Cohesion: 0.06
Nodes (40): isBalancerProtocol(), isCurveProtocol(), isSwapExecutionProtocol(), isV2Protocol(), isV3Protocol(), normalizeProtocolKey(), defaultRatesForDecimals(), normalizeBalancerState() (+32 more)

### Community 7 - "Community 7"
Cohesion: 0.06
Nodes (27): getBalancerTokens(), normalizeAddressList(), enrichTokens(), getCurveTokens(), enrichTokens(), normalizeCurveTokenList(), fetchGasPrice(), stop() (+19 more)

### Community 8 - "Community 8"
Cohesion: 0.09
Nodes (26): assertValidRouteForExecution(), buildArbTx(), buildTransferTx(), resolveFlashLoan(), buildFlashParams(), callbackProtocolId(), computeRouteHash(), encodeBalancerHop() (+18 more)

### Community 9 - "Community 9"
Cohesion: 0.09
Nodes (16): normaliseRouteSegment(), requireRouteAddress(), routeExecutionCacheKey(), routeIdentityFromEdges(), routeIdentityFromSerializedPath(), main(), buildChunkStateObject(), buildEvaluationChunks() (+8 more)

### Community 10 - "Community 10"
Cohesion: 0.12
Nodes (24): exp(), getBalancerAmountIn(), getBalancerAmountOut(), ln(), powDown(), simulateBalancerSwap(), toBigInt(), defaultRates() (+16 more)

### Community 11 - "Community 11"
Cohesion: 0.2
Nodes (18): divRoundingUp(), mulDiv(), mulDivRoundingUp(), getAmount0Delta(), getAmount1Delta(), getNextSqrtPriceFromAmount0RoundingUp(), getNextSqrtPriceFromAmount1RoundingDown(), getNextSqrtPriceFromInput() (+10 more)

### Community 12 - "Community 12"
Cohesion: 0.17
Nodes (18): jsonRpc(), polygonPrivateMempoolHeaders(), privateMempoolSupportsBundles(), racePublicRPCs(), rpcShortUrl(), sendBundleAlchemy(), sendPolygonPrivateTransaction(), sendPrivateBundle() (+10 more)

### Community 13 - "Community 13"
Cohesion: 0.25
Nodes (12): appendCapturedLog(), colorize(), formatLogs(), formatStatus(), installOutputGuard(), normalizeOpportunity(), pad(), renderFrame() (+4 more)

### Community 14 - "Community 14"
Cohesion: 0.24
Nodes (12): evaluateCandidatePipeline(), scoreForCandidate(), selectOptimizationCandidates(), shouldOptimizeCandidate(), bigintToApproxNumber(), ceilDiv(), estimateGasCostWei(), gasCostInStartTokenUnits() (+4 more)

### Community 15 - "Community 15"
Cohesion: 0.31
Nodes (11): enrichDiscoveredPools(), throttledMap(), chunk(), fetchMultipleV3States(), fetchPoolCore(), fetchTickBitmap(), fetchTickBitmapWindow(), fetchTickBitmapWordRange() (+3 more)

### Community 16 - "Community 16"
Cohesion: 0.38
Nodes (3): fetchAbi(), fetchAbiWithRetry(), sleep()

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `RegistryService` connect `Community 0` to `Community 1`, `Community 2`, `Community 3`, `Community 5`, `Community 6`?**
  _High betweenness centrality (0.097) - this node is a cross-community bridge._
- **Why does `log()` connect `Community 1` to `Community 0`, `Community 3`, `Community 4`, `Community 5`, `Community 6`, `Community 9`, `Community 12`, `Community 15`?**
  _High betweenness centrality (0.043) - this node is a cross-community bridge._
- **Why does `StateWatcher` connect `Community 0` to `Community 3`, `Community 5`?**
  _High betweenness centrality (0.035) - this node is a cross-community bridge._
- **Are the 19 inferred relationships involving `log()` (e.g. with `fetchAllLogsWithClient()` and `enrichDiscoveredPools()`) actually correct?**
  _`log()` has 19 INFERRED edges - model-reasoned connections that need verification._
- **Are the 17 inferred relationships involving `normalizeProtocolKey()` (e.g. with `protocolSupportsRouting()` and `getProtocolKind()`) actually correct?**
  _`normalizeProtocolKey()` has 17 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.03 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.03 - nodes in this community are weakly interconnected._