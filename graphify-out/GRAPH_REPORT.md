# Graph Report - /home/x/t  (2026-04-20)

## Corpus Check
- 91 files · ~57,047 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 645 nodes · 1342 edges · 30 communities detected
- Extraction: 73% EXTRACTED · 27% INFERRED · 0% AMBIGUOUS · INFERRED: 369 edges (avg confidence: 0.8)
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

## God Nodes (most connected - your core abstractions)
1. `RegistryService` - 47 edges
2. `log()` - 40 edges
3. `refreshCycles()` - 20 edges
4. `WorkerPool` - 18 edges
5. `StateWatcher` - 18 edges
6. `RpcManager` - 17 edges
7. `discoverProtocol()` - 16 edges
8. `executeWithRpcRetry()` - 16 edges
9. `findArbs()` - 15 edges
10. `main()` - 15 edges

## Surprising Connections (you probably didn't know these)
- `main()` --calls--> `startMetricsServer()`  [INFERRED]
  /home/x/t/runner.ts → src/utils/metrics.ts
- `refreshCycles()` --calls--> `enumerateCyclesDual()`  [INFERRED]
  /home/x/t/runner.ts → src/routing/enumerate_cycles.ts
- `refreshCycles()` --calls--> `enumerateCycles()`  [INFERRED]
  /home/x/t/runner.ts → src/routing/enumerate_cycles.ts
- `getFeeBps()` --calls--> `toFiniteNumber()`  [INFERRED]
  /home/x/t/src/routing/graph.ts → src/util/bigint.ts
- `simulateHop()` --calls--> `simulateV3Swap()`  [INFERRED]
  /home/x/t/src/routing/simulator.ts → src/math/uniswap_v3.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.05
Nodes (63): applySlippage(), computeProfit(), gasCostWei(), isProfitable(), revertRiskPenalty(), serializeTopology(), _completePass(), _storeBatchResults() (+55 more)

### Community 1 - "Community 1"
Cohesion: 0.04
Nodes (21): throwUnsupportedHypersync(), UnsupportedDecoder, detectReorg(), pick(), buildDiscoveredPoolBatch(), decodeDiscoveryLogs(), discoverCurveRemovals(), discoverPools() (+13 more)

### Community 2 - "Community 2"
Cohesion: 0.06
Nodes (50): assetStmt(), batchUpsertTokenMeta(), getPoolFee(), getTokenDecimals(), getTokenMeta(), upsertPoolFee(), upsertTokenMeta(), checkpointStmt() (+42 more)

### Community 3 - "Community 3"
Cohesion: 0.05
Nodes (28): getBalancerTokens(), enrichTokens(), getCurveTokens(), discoverCurveListedFactory(), enrichTokens(), fetchAndNormalizeBalancerPool(), fetchBalancerPoolState(), readContractWithTimeout() (+20 more)

### Community 4 - "Community 4"
Cohesion: 0.08
Nodes (15): mergeStateIntoCache(), reloadCacheFromRegistry(), admitPoolsToGraphs(), createWatcherProtocolHandlers(), commitWatcherState(), handleWatcherLogs(), mergeWatcherState(), persistWatcherState() (+7 more)

### Community 5 - "Community 5"
Cohesion: 0.1
Nodes (29): exp(), getBalancerAmountIn(), getBalancerAmountOut(), ln(), powDown(), simulateBalancerSwap(), toBigInt(), defaultRates() (+21 more)

### Community 6 - "Community 6"
Cohesion: 0.12
Nodes (19): toFiniteNumber(), enumerateCycles(), enumerateCyclesDual(), enumerateCyclesForToken(), pruneByLiquidity(), sortByLogWeight(), annotatePath(), deduplicatePaths() (+11 more)

### Community 7 - "Community 7"
Cohesion: 0.11
Nodes (9): executeWithRpcRetry(), isEndpointCapabilityError(), _isMethodUnavailableError(), isRateLimitError(), isRetryableError(), lazyMetrics(), RpcEndpoint, RpcManager (+1 more)

### Community 8 - "Community 8"
Cohesion: 0.11
Nodes (20): buildArbTx(), buildTransferTx(), gasEstimateCacheKeyForRoute(), resolveFlashLoan(), buildFlashParams(), computeRouteHash(), encodeBalancerHop(), encodeCurveHop() (+12 more)

### Community 9 - "Community 9"
Cohesion: 0.13
Nodes (15): addPoolEdges(), buildGraph(), buildHubGraph(), createSwapEdge(), deserializeTopology(), getFeeBps(), getLiveStateRef(), getProtocolKind() (+7 more)

### Community 10 - "Community 10"
Cohesion: 0.09
Nodes (14): PollBalancer, PollCurve, PollUniv2, PollUniv3, _startLoop(), jsonRpc(), polygonPrivateMempoolHeaders(), privateMempoolSupportsBundles() (+6 more)

### Community 11 - "Community 11"
Cohesion: 0.08
Nodes (7): routeKeyFromEdges(), clearGasEstimateCache(), startMetricsServer(), stopMetricsServer(), RouteCache, mergeArbPaths(), shutdown()

### Community 12 - "Community 12"
Cohesion: 0.12
Nodes (6): buildChunkStateObject(), buildEvaluationChunks(), getStateVersion(), serialisedPathKey(), summariseEvaluationChunks(), WorkerPool

### Community 13 - "Community 13"
Cohesion: 0.21
Nodes (11): NonceManager, clearTrackedReceipt(), dryRun(), logFailure(), pollPendingReceipts(), pollTrackedReceipt(), sendTx(), sendTxBundle() (+3 more)

### Community 14 - "Community 14"
Cohesion: 0.23
Nodes (15): divRoundingUp(), mulDiv(), mulDivRoundingUp(), getAmount0Delta(), getAmount1Delta(), getNextSqrtPriceFromAmount0RoundingUp(), getNextSqrtPriceFromAmount1RoundingDown(), getNextSqrtPriceFromInput() (+7 more)

### Community 15 - "Community 15"
Cohesion: 0.4
Nodes (3): formatOpportunities(), renderFrame(), startTui()

### Community 16 - "Community 16"
Cohesion: 0.7
Nodes (4): estimateGasCostWei(), rankRoutes(), scoreRoute(), selectBestRoute()

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

## Knowledge Gaps
- **Thin community `Community 17`** (2 nodes): `decode()`, `curve_crypto_factory.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 18`** (2 nodes): `decode()`, `curve_stable_factory.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 19`** (2 nodes): `decode()`, `quickswap_v3.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 20`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 21`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 22`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 23`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 24`** (1 nodes): `abi_fragments.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 25`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 26`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 27`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 28`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 29`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `RegistryService` connect `Community 1` to `Community 0`, `Community 2`, `Community 3`, `Community 4`?**
  _High betweenness centrality (0.106) - this node is a cross-community bridge._
- **Why does `log()` connect `Community 0` to `Community 1`, `Community 3`, `Community 4`, `Community 6`, `Community 10`, `Community 13`?**
  _High betweenness centrality (0.096) - this node is a cross-community bridge._
- **Why does `executeWithRpcRetry()` connect `Community 7` to `Community 8`, `Community 3`?**
  _High betweenness centrality (0.090) - this node is a cross-community bridge._
- **Are the 25 inferred relationships involving `log()` (e.g. with `fetchAllLogs()` and `enrichDiscoveredPools()`) actually correct?**
  _`log()` has 25 INFERRED edges - model-reasoned connections that need verification._
- **Are the 9 inferred relationships involving `refreshCycles()` (e.g. with `.getActivePoolsMeta()` and `buildGraph()`) actually correct?**
  _`refreshCycles()` has 9 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.04 - nodes in this community are weakly interconnected._