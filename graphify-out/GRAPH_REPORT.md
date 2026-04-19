# Graph Report - /home/x/t  (2026-04-19)

## Corpus Check
- 83 files · ~52,533 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 581 nodes · 1205 edges · 21 communities detected
- Extraction: 74% EXTRACTED · 26% INFERRED · 0% AMBIGUOUS · INFERRED: 310 edges (avg confidence: 0.8)
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
- `log()` --calls--> `fetchAllLogs()`  [INFERRED]
  runner.ts → src/hypersync/paginate.ts
- `log()` --calls--> `discoverProtocol()`  [INFERRED]
  runner.ts → src/discovery/discover.ts
- `log()` --calls--> `discoverCurveRemovals()`  [INFERRED]
  runner.ts → src/discovery/discover.ts
- `log()` --calls--> `discoverPools()`  [INFERRED]
  runner.ts → src/discovery/discover.ts
- `log()` --calls--> `discoverV3Pools()`  [INFERRED]
  runner.ts → src/discovery/uniswap_v3.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.05
Nodes (45): assetStmt(), batchUpsertTokenMeta(), getPoolFee(), getTokenDecimals(), getTokenMeta(), upsertPoolFee(), upsertTokenMeta(), lowerCaseAddressList() (+37 more)

### Community 1 - "Community 1"
Cohesion: 0.06
Nodes (50): applySlippage(), computeProfit(), gasCostWei(), isProfitable(), revertRiskPenalty(), startTui(), startMetricsServer(), stopMetricsServer() (+42 more)

### Community 2 - "Community 2"
Cohesion: 0.05
Nodes (15): throwUnsupportedHypersync(), UnsupportedDecoder, discoverCurveRemovals(), discoverPools(), discoverProtocol(), discoveryCheckpointFromNextBlock(), fetchAllLogs(), RegistryService (+7 more)

### Community 3 - "Community 3"
Cohesion: 0.06
Nodes (26): buildArbTx(), buildTransferTx(), resolveFlashLoan(), buildFlashParams(), computeRouteHash(), encodeBalancerHop(), encodeCurveHop(), encodeExecuteArb() (+18 more)

### Community 4 - "Community 4"
Cohesion: 0.06
Nodes (18): getBalancerTokens(), enrichTokens(), getCurveTokens(), enrichTokens(), PollUniv2, readContractWithRetry(), rpcShortUrl(), throttledMap() (+10 more)

### Community 5 - "Community 5"
Cohesion: 0.09
Nodes (27): toFiniteNumber(), enumerateCycles(), enumerateCyclesDual(), enumerateCyclesForToken(), pruneByLiquidity(), sortByLogWeight(), annotatePath(), deduplicatePaths() (+19 more)

### Community 6 - "Community 6"
Cohesion: 0.07
Nodes (8): routeKeyFromEdges(), RouteCache, buildChunkStateObject(), buildEvaluationChunks(), getStateVersion(), serialisedPathKey(), summariseEvaluationChunks(), WorkerPool

### Community 7 - "Community 7"
Cohesion: 0.08
Nodes (16): mergeStateIntoCache(), reloadCacheFromRegistry(), detectReorg(), pick(), createWatcherProtocolHandlers(), commitWatcherState(), handleWatcherLogs(), mergeWatcherState() (+8 more)

### Community 8 - "Community 8"
Cohesion: 0.08
Nodes (19): normalizeBalancerState(), normalizeCurveState(), normalizePoolState(), normalizeV2State(), normalizeV3State(), validatePoolState(), fetchAndNormalizeBalancerPool(), fetchBalancerPoolState() (+11 more)

### Community 9 - "Community 9"
Cohesion: 0.12
Nodes (13): NonceManager, PriceOracle, checkpointStmt(), getCheckpoint(), getGlobalCheckpoint(), getRollbackGuard(), rollbackToBlock(), setCheckpoint() (+5 more)

### Community 10 - "Community 10"
Cohesion: 0.13
Nodes (21): exp(), getBalancerAmountIn(), getBalancerAmountOut(), ln(), powDown(), simulateBalancerSwap(), defaultRates(), getCurveAmountIn() (+13 more)

### Community 11 - "Community 11"
Cohesion: 0.23
Nodes (15): divRoundingUp(), mulDiv(), mulDivRoundingUp(), getAmount0Delta(), getAmount1Delta(), getNextSqrtPriceFromAmount0RoundingUp(), getNextSqrtPriceFromAmount1RoundingDown(), getNextSqrtPriceFromInput() (+7 more)

### Community 12 - "Community 12"
Cohesion: 0.44
Nodes (7): jsonRpc(), racePublicRPCs(), sendBundleAlchemy(), sendBundleBloXroute(), sendPrivateTransaction(), sendPrivateTx(), sendViaBloXroute()

### Community 13 - "Community 13"
Cohesion: 0.7
Nodes (4): estimateGasCostWei(), rankRoutes(), scoreRoute(), selectBestRoute()

### Community 14 - "Community 14"
Cohesion: 1.0
Nodes (0): 

### Community 15 - "Community 15"
Cohesion: 1.0
Nodes (0): 

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

## Knowledge Gaps
- **Thin community `Community 14`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 15`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
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

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `RegistryService` connect `Community 2` to `Community 0`, `Community 1`, `Community 9`, `Community 7`?**
  _High betweenness centrality (0.117) - this node is a cross-community bridge._
- **Why does `log()` connect `Community 1` to `Community 2`, `Community 5`, `Community 7`, `Community 9`, `Community 12`?**
  _High betweenness centrality (0.071) - this node is a cross-community bridge._
- **Why does `simulateV3Swap()` connect `Community 11` to `Community 9`, `Community 10`?**
  _High betweenness centrality (0.038) - this node is a cross-community bridge._
- **Are the 19 inferred relationships involving `log()` (e.g. with `fetchAllLogs()` and `discoverProtocol()`) actually correct?**
  _`log()` has 19 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._