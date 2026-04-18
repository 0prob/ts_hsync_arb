# Graph Report - .  (2026-04-18)

## Corpus Check
- 82 files · ~51,436 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 576 nodes · 1189 edges · 23 communities detected
- Extraction: 74% EXTRACTED · 26% INFERRED · 0% AMBIGUOUS · INFERRED: 308 edges (avg confidence: 0.8)
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

## God Nodes (most connected - your core abstractions)
1. `RegistryService` - 47 edges
2. `log()` - 32 edges
3. `StateWatcher` - 18 edges
4. `WorkerPool` - 17 edges
5. `RpcManager` - 17 edges
6. `refreshCycles()` - 16 edges
7. `findArbs()` - 15 edges
8. `main()` - 15 edges
9. `executeWithRpcRetry()` - 15 edges
10. `RoutingGraph` - 13 edges

## Surprising Connections (you probably didn't know these)
- `quoteBasedLogWeight()` --calls--> `log()`  [INFERRED]
  src/routing/finder.ts → runner.ts
- `edgeSpotLogWeight()` --calls--> `log()`  [INFERRED]
  src/routing/finder.ts → runner.ts
- `sendPrivateTx()` --calls--> `log()`  [INFERRED]
  src/execution/private_tx.ts → runner.ts
- `sendTx()` --calls--> `log()`  [INFERRED]
  src/execution/send_tx.ts → runner.ts
- `mergeCandidateBatch()` --calls--> `routeKeyFromEdges()`  [INFERRED]
  runner.ts → src/routing/finder.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.05
Nodes (48): assetStmt(), batchUpsertTokenMeta(), getPoolFee(), getTokenDecimals(), getTokenMeta(), upsertPoolFee(), upsertTokenMeta(), checkpointStmt() (+40 more)

### Community 1 - "Community 1"
Cohesion: 0.06
Nodes (30): mergeStateIntoCache(), reloadCacheFromRegistry(), throwUnsupportedHypersync(), UnsupportedDecoder, detectReorg(), pick(), discoverCurveRemovals(), discoverPools() (+22 more)

### Community 2 - "Community 2"
Cohesion: 0.05
Nodes (30): normalizeBalancerState(), normalizeCurveState(), normalizePoolState(), normalizeV2State(), normalizeV3State(), fetchAndNormalizeBalancerPool(), fetchBalancerPoolState(), PollBalancer (+22 more)

### Community 3 - "Community 3"
Cohesion: 0.06
Nodes (46): applySlippage(), computeProfit(), gasCostWei(), isProfitable(), revertRiskPenalty(), serializeTopology(), startTui(), startMetricsServer() (+38 more)

### Community 4 - "Community 4"
Cohesion: 0.05
Nodes (5): RegistryService, removePoolsFromGraphs(), seedStateCache(), CompatDatabase, runValidation()

### Community 5 - "Community 5"
Cohesion: 0.1
Nodes (25): enumerateCycles(), enumerateCyclesDual(), enumerateCyclesForToken(), pruneByLiquidity(), sortByLogWeight(), annotatePath(), deduplicatePaths(), edgeSpotLogWeight() (+17 more)

### Community 6 - "Community 6"
Cohesion: 0.11
Nodes (9): executeWithRpcRetry(), isEndpointCapabilityError(), _isMethodUnavailableError(), isRateLimitError(), isRetryableError(), lazyMetrics(), RpcEndpoint, RpcManager (+1 more)

### Community 7 - "Community 7"
Cohesion: 0.11
Nodes (17): buildArbTx(), buildTransferTx(), resolveFlashLoan(), buildFlashParams(), computeRouteHash(), encodeBalancerHop(), encodeCurveHop(), encodeExecuteArb() (+9 more)

### Community 8 - "Community 8"
Cohesion: 0.13
Nodes (8): NonceManager, validatePoolState(), PriceOracle, admitPoolsToGraphs(), partitionChangedPools(), dryRun(), logFailure(), sendTx()

### Community 9 - "Community 9"
Cohesion: 0.12
Nodes (21): exp(), getBalancerAmountIn(), getBalancerAmountOut(), ln(), powDown(), simulateBalancerSwap(), defaultRates(), getCurveAmountIn() (+13 more)

### Community 10 - "Community 10"
Cohesion: 0.12
Nodes (6): buildChunkStateObject(), buildEvaluationChunks(), getStateVersion(), serialisedPathKey(), summariseEvaluationChunks(), WorkerPool

### Community 11 - "Community 11"
Cohesion: 0.09
Nodes (5): getBalancerTokens(), enrichTokens(), getCurveTokens(), enrichTokens(), decode()

### Community 12 - "Community 12"
Cohesion: 0.23
Nodes (15): divRoundingUp(), mulDiv(), mulDivRoundingUp(), getAmount0Delta(), getAmount1Delta(), getNextSqrtPriceFromAmount0RoundingUp(), getNextSqrtPriceFromAmount1RoundingDown(), getNextSqrtPriceFromInput() (+7 more)

### Community 13 - "Community 13"
Cohesion: 0.15
Nodes (4): routeKeyFromEdges(), stopMetricsServer(), RouteCache, shutdown()

### Community 14 - "Community 14"
Cohesion: 0.44
Nodes (7): jsonRpc(), racePublicRPCs(), sendBundleAlchemy(), sendBundleBloXroute(), sendPrivateTransaction(), sendPrivateTx(), sendViaBloXroute()

### Community 15 - "Community 15"
Cohesion: 0.7
Nodes (4): estimateGasCostWei(), rankRoutes(), scoreRoute(), selectBestRoute()

### Community 16 - "Community 16"
Cohesion: 1.0
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

## Knowledge Gaps
- **Thin community `Community 16`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 17`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 18`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 19`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 20`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 21`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 22`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `RegistryService` connect `Community 4` to `Community 0`, `Community 1`, `Community 2`, `Community 3`, `Community 8`?**
  _High betweenness centrality (0.116) - this node is a cross-community bridge._
- **Why does `log()` connect `Community 1` to `Community 2`, `Community 3`, `Community 4`, `Community 5`, `Community 8`, `Community 13`, `Community 14`?**
  _High betweenness centrality (0.071) - this node is a cross-community bridge._
- **Why does `simulateV3Swap()` connect `Community 12` to `Community 8`, `Community 9`?**
  _High betweenness centrality (0.038) - this node is a cross-community bridge._
- **Are the 19 inferred relationships involving `log()` (e.g. with `fetchAllLogs()` and `discoverProtocol()`) actually correct?**
  _`log()` has 19 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._