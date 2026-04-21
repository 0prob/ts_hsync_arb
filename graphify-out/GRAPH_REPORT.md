# Graph Report - /home/x/t  (2026-04-21)

## Corpus Check
- 113 files · ~62,379 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 673 nodes · 1346 edges · 31 communities detected
- Extraction: 72% EXTRACTED · 28% INFERRED · 0% AMBIGUOUS · INFERRED: 376 edges (avg confidence: 0.8)
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
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]

## God Nodes (most connected - your core abstractions)
1. `RegistryService` - 47 edges
2. `log()` - 32 edges
3. `refreshCycles()` - 19 edges
4. `WorkerPool` - 18 edges
5. `StateWatcher` - 18 edges
6. `discoverProtocol()` - 17 edges
7. `RpcManager` - 17 edges
8. `executeWithRpcRetry()` - 16 edges
9. `RoutingGraph` - 13 edges
10. `PriceOracle` - 13 edges

## Surprising Connections (you probably didn't know these)
- `refreshCycles()` --calls--> `enumerateCyclesDual()`  [INFERRED]
  /home/x/t/runner.ts → src/routing/enumerate_cycles.ts
- `refreshCycles()` --calls--> `enumerateCycles()`  [INFERRED]
  /home/x/t/runner.ts → src/routing/enumerate_cycles.ts
- `getFeeBps()` --calls--> `toFiniteNumber()`  [INFERRED]
  /home/x/t/src/routing/graph.ts → src/util/bigint.ts
- `simulateHop()` --calls--> `simulateV3Swap()`  [INFERRED]
  /home/x/t/src/routing/simulator.ts → src/math/uniswap_v3.ts
- `readContractWithRetry()` --calls--> `fetchV2PoolState()`  [INFERRED]
  /home/x/t/src/enrichment/rpc.ts → src/state/uniswap_v2.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.03
Nodes (24): throwUnsupportedHypersync(), UnsupportedDecoder, discoverCurveListedFactory(), detectReorg(), pick(), buildDiscoveredPoolBatch(), decodeDiscoveryLogs(), discoverCurveRemovals() (+16 more)

### Community 1 - "Community 1"
Cohesion: 0.04
Nodes (34): partitionFreshCandidates(), routeKeyFromEdges(), formatOpportunities(), renderFrame(), startTui(), configureWatcherCallbacks(), startMetricsServer(), getPathFreshness() (+26 more)

### Community 2 - "Community 2"
Cohesion: 0.05
Nodes (45): assetStmt(), batchUpsertTokenMeta(), getPoolFee(), getTokenDecimals(), getTokenMeta(), upsertPoolFee(), upsertTokenMeta(), lowerCaseAddressList() (+37 more)

### Community 3 - "Community 3"
Cohesion: 0.05
Nodes (22): buildTransferTx(), clampBigInt(), estimateGas(), fetchEIP1559Fees(), fetchGasPrice(), gasEstimateCacheKey(), GasOracle, quickGasCheck() (+14 more)

### Community 4 - "Community 4"
Cohesion: 0.06
Nodes (35): normalizeBalancerState(), normalizeCurveState(), normalizePoolState(), normalizeV2State(), normalizeV3State(), validatePoolState(), fetchAndNormalizeBalancerPool(), fetchBalancerPoolState() (+27 more)

### Community 5 - "Community 5"
Cohesion: 0.09
Nodes (20): clearGasEstimateCache(), NonceManager, checkpointStmt(), getCheckpoint(), getGlobalCheckpoint(), getRollbackGuard(), rollbackToBlock(), setCheckpoint() (+12 more)

### Community 6 - "Community 6"
Cohesion: 0.08
Nodes (29): assessmentNetProfit(), assessRouteResult(), compareAssessmentProfit(), getAssessmentOptimizationOptions(), getOptimizationOptions(), minProfitInTokenUnits(), applySlippage(), computeProfit() (+21 more)

### Community 7 - "Community 7"
Cohesion: 0.12
Nodes (19): toFiniteNumber(), enumerateCycles(), enumerateCyclesDual(), enumerateCyclesForToken(), pruneByLiquidity(), sortByLogWeight(), annotatePath(), deduplicatePaths() (+11 more)

### Community 8 - "Community 8"
Cohesion: 0.09
Nodes (10): routeExecutionCacheKey(), routeIdentityFromEdges(), routeIdentityFromSerializedPath(), buildChunkStateObject(), buildEvaluationChunks(), getStateVersion(), serialisedPathKey(), serialiseEvaluationPath() (+2 more)

### Community 9 - "Community 9"
Cohesion: 0.13
Nodes (5): getBalancerTokens(), enrichTokens(), getCurveTokens(), enrichTokens(), isNoDataReadContractError()

### Community 10 - "Community 10"
Cohesion: 0.13
Nodes (13): mergeStateIntoCache(), reloadCacheFromRegistry(), createWatcherProtocolHandlers(), cloneWatcherState(), commitWatcherState(), handleWatcherLogs(), mergeWatcherState(), persistWatcherState() (+5 more)

### Community 11 - "Community 11"
Cohesion: 0.23
Nodes (15): divRoundingUp(), mulDiv(), mulDivRoundingUp(), getAmount0Delta(), getAmount1Delta(), getNextSqrtPriceFromAmount0RoundingUp(), getNextSqrtPriceFromAmount1RoundingDown(), getNextSqrtPriceFromInput() (+7 more)

### Community 12 - "Community 12"
Cohesion: 0.23
Nodes (14): addPoolEdges(), buildGraph(), buildHubGraph(), createSwapEdge(), deserializeTopology(), getFeeBps(), getLiveStateRef(), getProtocolKind() (+6 more)

### Community 13 - "Community 13"
Cohesion: 0.14
Nodes (8): evaluateCandidatePipeline(), selectOptimizationCandidates(), shouldOptimizeCandidate(), estimateGasCostWei(), gasCostInStartTokenUnits(), rankRoutes(), scoreRoute(), selectBestRoute()

### Community 14 - "Community 14"
Cohesion: 0.26
Nodes (11): assertValidRouteForExecution(), buildArbTx(), resolveFlashLoan(), buildFlashParams(), computeRouteHash(), encodeBalancerHop(), encodeCurveHop(), encodeExecuteArb() (+3 more)

### Community 15 - "Community 15"
Cohesion: 0.36
Nodes (9): jsonRpc(), polygonPrivateMempoolHeaders(), privateMempoolSupportsBundles(), racePublicRPCs(), sendBundleAlchemy(), sendPolygonPrivateTransaction(), sendPrivateBundle(), sendPrivateTransaction() (+1 more)

### Community 16 - "Community 16"
Cohesion: 0.44
Nodes (7): exp(), getBalancerAmountIn(), getBalancerAmountOut(), ln(), powDown(), simulateBalancerSwap(), toBigInt()

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

### Community 27 - "Community 27"
Cohesion: 1.0
Nodes (0): 

### Community 28 - "Community 28"
Cohesion: 1.0
Nodes (0): 

### Community 29 - "Community 29"
Cohesion: 1.0
Nodes (0): 

### Community 30 - "Community 30"
Cohesion: 1.0
Nodes (0): 

## Knowledge Gaps
- **Thin community `Community 17`** (2 nodes): `decode()`, `curve_crypto_factory.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 18`** (2 nodes): `decode()`, `curve_stable_factory.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 19`** (2 nodes): `decode()`, `quickswap_v3.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 20`** (2 nodes): `createDestination()`, `logger.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 21`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 22`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 23`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 24`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 25`** (1 nodes): `abi_fragments.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 26`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 27`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 28`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 29`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 30`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `RegistryService` connect `Community 0` to `Community 1`, `Community 2`, `Community 10`, `Community 4`?**
  _High betweenness centrality (0.106) - this node is a cross-community bridge._
- **Why does `log()` connect `Community 4` to `Community 0`, `Community 1`, `Community 5`, `Community 6`, `Community 7`, `Community 15`?**
  _High betweenness centrality (0.084) - this node is a cross-community bridge._
- **Why does `simulateV3Swap()` connect `Community 11` to `Community 5`, `Community 6`?**
  _High betweenness centrality (0.054) - this node is a cross-community bridge._
- **Are the 27 inferred relationships involving `log()` (e.g. with `fetchAllLogs()` and `enrichDiscoveredPools()`) actually correct?**
  _`log()` has 27 INFERRED edges - model-reasoned connections that need verification._
- **Are the 12 inferred relationships involving `refreshCycles()` (e.g. with `.getActivePoolsMeta()` and `buildGraph()`) actually correct?**
  _`refreshCycles()` has 12 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.03 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.04 - nodes in this community are weakly interconnected._