# Graph Report - /home/x/t/src  (2026-04-21)

## Corpus Check
- 103 files · ~56,752 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 630 nodes · 1209 edges · 27 communities detected
- Extraction: 76% EXTRACTED · 24% INFERRED · 0% AMBIGUOUS · INFERRED: 296 edges (avg confidence: 0.8)
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
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]

## God Nodes (most connected - your core abstractions)
1. `RegistryService` - 47 edges
2. `WorkerPool` - 18 edges
3. `StateWatcher` - 18 edges
4. `RpcManager` - 17 edges
5. `executeWithRpcRetry()` - 16 edges
6. `discoverProtocol()` - 15 edges
7. `RoutingGraph` - 13 edges
8. `PriceOracle` - 13 edges
9. `NonceManager` - 12 edges
10. `RouteCache` - 11 edges

## Surprising Connections (you probably didn't know these)
- `fetchGasPrice()` --calls--> `executeWithRpcRetry()`  [INFERRED]
  /home/x/t/src/execution/gas.ts → /home/x/t/src/enrichment/rpc.ts
- `fetchAllLogs()` --calls--> `applyHistoricalHyperSyncQueryPolicy()`  [INFERRED]
  /home/x/t/src/hypersync/paginate.ts → /home/x/t/src/hypersync/query_policy.ts
- `enrichDiscoveredPools()` --calls--> `throttledMap()`  [INFERRED]
  /home/x/t/src/discovery/discover.ts → /home/x/t/src/enrichment/rpc.ts
- `discoverProtocol()` --calls--> `throttledMap()`  [INFERRED]
  /home/x/t/src/discovery/discover.ts → /home/x/t/src/enrichment/rpc.ts
- `routeKeyFromEdges()` --calls--> `mergeCandidateBatch()`  [INFERRED]
  /home/x/t/src/routing/finder.ts → /home/x/t/src/arb/search.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.05
Nodes (53): getPathFreshness(), assetStmt(), batchUpsertTokenMeta(), getPoolFee(), getTokenDecimals(), getTokenMeta(), upsertPoolFee(), upsertTokenMeta() (+45 more)

### Community 1 - "Community 1"
Cohesion: 0.05
Nodes (29): throwUnsupportedHypersync(), UnsupportedDecoder, detectReorg(), pick(), buildDiscoveredPoolBatch(), decodeDiscoveryLogs(), discoverCurveRemovals(), discoverPools() (+21 more)

### Community 2 - "Community 2"
Cohesion: 0.05
Nodes (40): defaultRates(), getCurveAmountIn(), getCurveAmountOut(), getD(), getY(), simulateCurveSwap(), toXp(), normalizeBalancerState() (+32 more)

### Community 3 - "Community 3"
Cohesion: 0.06
Nodes (13): routeKeyFromEdges(), clearGasEstimateCache(), RouteCache, routeExecutionCacheKey(), routeIdentityFromEdges(), routeIdentityFromSerializedPath(), buildChunkStateObject(), buildEvaluationChunks() (+5 more)

### Community 4 - "Community 4"
Cohesion: 0.09
Nodes (26): toFiniteNumber(), enumerateCycles(), enumerateCyclesDual(), enumerateCyclesForToken(), pruneByLiquidity(), sortByLogWeight(), annotatePath(), deduplicatePaths() (+18 more)

### Community 5 - "Community 5"
Cohesion: 0.05
Nodes (4): discoverCurveListedFactory(), RegistryService, CompatDatabase, runValidation()

### Community 6 - "Community 6"
Cohesion: 0.09
Nodes (28): assessmentNetProfit(), assessRouteResult(), compareAssessmentProfit(), getAssessmentOptimizationOptions(), getOptimizationOptions(), minProfitInTokenUnits(), exp(), getBalancerAmountIn() (+20 more)

### Community 7 - "Community 7"
Cohesion: 0.08
Nodes (11): mergeStateIntoCache(), reloadCacheFromRegistry(), getLiveStateRef(), getRoutablePoolContext(), stopMetricsServer(), getPoolMetadata(), getPoolTokens(), hasZeroAddressToken() (+3 more)

### Community 8 - "Community 8"
Cohesion: 0.1
Nodes (11): executeWithRpcRetry(), isEndpointCapabilityError(), _isMethodUnavailableError(), isRateLimitError(), isRetryableError(), lazyMetrics(), RpcEndpoint, RpcManager (+3 more)

### Community 9 - "Community 9"
Cohesion: 0.1
Nodes (21): assertValidRouteForExecution(), buildArbTx(), buildTransferTx(), resolveFlashLoan(), buildFlashParams(), computeRouteHash(), encodeBalancerHop(), encodeCurveHop() (+13 more)

### Community 10 - "Community 10"
Cohesion: 0.08
Nodes (5): getBalancerTokens(), enrichTokens(), getCurveTokens(), enrichTokens(), isNoDataReadContractError()

### Community 11 - "Community 11"
Cohesion: 0.2
Nodes (11): NonceManager, clearTrackedReceipt(), dryRun(), logFailure(), pollPendingReceipts(), pollTrackedReceipt(), sendTx(), sendTxBundle() (+3 more)

### Community 12 - "Community 12"
Cohesion: 0.23
Nodes (15): divRoundingUp(), mulDiv(), mulDivRoundingUp(), getAmount0Delta(), getAmount1Delta(), getNextSqrtPriceFromAmount0RoundingUp(), getNextSqrtPriceFromAmount1RoundingDown(), getNextSqrtPriceFromInput() (+7 more)

### Community 13 - "Community 13"
Cohesion: 0.14
Nodes (11): evaluateCandidatePipeline(), partitionFreshCandidates(), selectOptimizationCandidates(), shouldOptimizeCandidate(), estimateGasCostWei(), gasCostInStartTokenUnits(), rankRoutes(), scoreRoute() (+3 more)

### Community 14 - "Community 14"
Cohesion: 0.36
Nodes (9): jsonRpc(), polygonPrivateMempoolHeaders(), privateMempoolSupportsBundles(), racePublicRPCs(), sendBundleAlchemy(), sendPolygonPrivateTransaction(), sendPrivateBundle(), sendPrivateTransaction() (+1 more)

### Community 15 - "Community 15"
Cohesion: 0.4
Nodes (2): formatOpportunities(), renderFrame()

### Community 16 - "Community 16"
Cohesion: 0.5
Nodes (0): 

### Community 17 - "Community 17"
Cohesion: 1.0
Nodes (0): 

### Community 18 - "Community 18"
Cohesion: 1.0
Nodes (0): 

### Community 19 - "Community 19"
Cohesion: 1.0
Nodes (0): 

### Community 20 - "Community 20"
Cohesion: 1.0
Nodes (0): 

### Community 21 - "Community 21"
Cohesion: 1.0
Nodes (0): 

### Community 22 - "Community 22"
Cohesion: 1.0
Nodes (0): 

### Community 23 - "Community 23"
Cohesion: 1.0
Nodes (0): 

### Community 24 - "Community 24"
Cohesion: 1.0
Nodes (0): 

### Community 25 - "Community 25"
Cohesion: 1.0
Nodes (0): 

### Community 26 - "Community 26"
Cohesion: 1.0
Nodes (0): 

## Knowledge Gaps
- **Thin community `Community 17`** (2 nodes): `warmup.ts`, `createWarmupManager()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 18`** (2 nodes): `createDiscoveryCoordinator()`, `discovery.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 19`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 20`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 21`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 22`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 23`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 24`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 25`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 26`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `RegistryService` connect `Community 5` to `Community 0`, `Community 1`, `Community 2`, `Community 7`?**
  _High betweenness centrality (0.113) - this node is a cross-community bridge._
- **Why does `mergeCandidateBatch()` connect `Community 13` to `Community 0`, `Community 3`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._
- **Why does `recommendGasParams()` connect `Community 9` to `Community 0`?**
  _High betweenness centrality (0.050) - this node is a cross-community bridge._
- **Are the 12 inferred relationships involving `executeWithRpcRetry()` (e.g. with `.update()` and `fetchGasPrice()`) actually correct?**
  _`executeWithRpcRetry()` has 12 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._