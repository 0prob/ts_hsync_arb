# Graph Report - /home/x/t/src  (2026-04-18)

## Corpus Check
- 81 files · ~44,958 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 525 nodes · 983 edges · 24 communities detected
- Extraction: 76% EXTRACTED · 24% INFERRED · 0% AMBIGUOUS · INFERRED: 238 edges (avg confidence: 0.8)
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

## God Nodes (most connected - your core abstractions)
1. `RegistryService` - 47 edges
2. `StateWatcher` - 18 edges
3. `WorkerPool` - 17 edges
4. `executeWithRpcRetry()` - 15 edges
5. `RpcManager` - 14 edges
6. `RoutingGraph` - 13 edges
7. `discoverProtocol()` - 11 edges
8. `RouteCache` - 10 edges
9. `NonceManager` - 10 edges
10. `PriceOracle` - 10 edges

## Surprising Connections (you probably didn't know these)
- `discoverProtocol()` --calls--> `decode()`  [INFERRED]
  /home/x/t/src/discovery/discover.ts → /home/x/t/src/protocols/uniswap_v3.ts
- `discoverProtocol()` --calls--> `throttledMap()`  [INFERRED]
  /home/x/t/src/discovery/discover.ts → /home/x/t/src/enrichment/rpc.ts
- `discoverPools()` --calls--> `detectReorg()`  [INFERRED]
  /home/x/t/src/discovery/discover.ts → /home/x/t/src/reorg/detect.ts
- `simulateHop()` --calls--> `simulateV3Swap()`  [INFERRED]
  /home/x/t/src/routing/simulator.ts → /home/x/t/src/math/uniswap_v3.ts
- `buildTransferTx()` --calls--> `recommendGasParams()`  [INFERRED]
  /home/x/t/src/execution/build_tx.ts → /home/x/t/src/execution/gas.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.04
Nodes (15): throwUnsupportedHypersync(), UnsupportedDecoder, discoverCurveRemovals(), discoverPools(), discoverProtocol(), discoveryCheckpointFromNextBlock(), fetchAllLogs(), RegistryMetaCache (+7 more)

### Community 1 - "Community 1"
Cohesion: 0.05
Nodes (30): normalizeBalancerState(), normalizeCurveState(), normalizePoolState(), normalizeV2State(), normalizeV3State(), fetchAndNormalizeBalancerPool(), fetchBalancerPoolState(), PollBalancer (+22 more)

### Community 2 - "Community 2"
Cohesion: 0.07
Nodes (40): assetStmt(), batchUpsertTokenMeta(), getPoolFee(), getTokenDecimals(), getTokenMeta(), upsertPoolFee(), upsertTokenMeta(), lowerCaseAddressList() (+32 more)

### Community 3 - "Community 3"
Cohesion: 0.1
Nodes (24): enumerateCycles(), enumerateCyclesDual(), enumerateCyclesForToken(), pruneByLiquidity(), sortByLogWeight(), annotatePath(), deduplicatePaths(), edgeSpotLogWeight() (+16 more)

### Community 4 - "Community 4"
Cohesion: 0.07
Nodes (16): mergeStateIntoCache(), reloadCacheFromRegistry(), detectReorg(), pick(), createWatcherProtocolHandlers(), commitWatcherState(), handleWatcherLogs(), mergeWatcherState() (+8 more)

### Community 5 - "Community 5"
Cohesion: 0.08
Nodes (14): routeKeyFromEdges(), stopMetricsServer(), NonceManager, checkpointStmt(), getCheckpoint(), getGlobalCheckpoint(), getRollbackGuard(), rollbackToBlock() (+6 more)

### Community 6 - "Community 6"
Cohesion: 0.11
Nodes (10): fetchGasPrice(), executeWithRpcRetry(), isEndpointCapabilityError(), _isMethodUnavailableError(), isRateLimitError(), isRetryableError(), lazyMetrics(), RpcEndpoint (+2 more)

### Community 7 - "Community 7"
Cohesion: 0.12
Nodes (16): buildArbTx(), buildTransferTx(), resolveFlashLoan(), buildFlashParams(), computeRouteHash(), encodeBalancerHop(), encodeCurveHop(), encodeExecuteArb() (+8 more)

### Community 8 - "Community 8"
Cohesion: 0.13
Nodes (21): exp(), getBalancerAmountIn(), getBalancerAmountOut(), ln(), powDown(), simulateBalancerSwap(), defaultRates(), getCurveAmountIn() (+13 more)

### Community 9 - "Community 9"
Cohesion: 0.11
Nodes (7): deserializeTopology(), buildChunkStateObject(), buildEvaluationChunks(), getStateVersion(), serialisedPathKey(), summariseEvaluationChunks(), WorkerPool

### Community 10 - "Community 10"
Cohesion: 0.09
Nodes (5): getBalancerTokens(), enrichTokens(), getCurveTokens(), enrichTokens(), decode()

### Community 11 - "Community 11"
Cohesion: 0.23
Nodes (15): divRoundingUp(), mulDiv(), mulDivRoundingUp(), getAmount0Delta(), getAmount1Delta(), getNextSqrtPriceFromAmount0RoundingUp(), getNextSqrtPriceFromAmount1RoundingDown(), getNextSqrtPriceFromInput() (+7 more)

### Community 12 - "Community 12"
Cohesion: 0.16
Nodes (1): PriceOracle

### Community 13 - "Community 13"
Cohesion: 0.44
Nodes (7): jsonRpc(), racePublicRPCs(), sendBundleAlchemy(), sendBundleBloXroute(), sendPrivateTransaction(), sendPrivateTx(), sendViaBloXroute()

### Community 14 - "Community 14"
Cohesion: 0.6
Nodes (5): applySlippage(), computeProfit(), gasCostWei(), isProfitable(), revertRiskPenalty()

### Community 15 - "Community 15"
Cohesion: 0.7
Nodes (4): estimateGasCostWei(), rankRoutes(), scoreRoute(), selectBestRoute()

### Community 16 - "Community 16"
Cohesion: 0.67
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

## Knowledge Gaps
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
- **Thin community `Community 23`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `RegistryService` connect `Community 0` to `Community 1`, `Community 2`, `Community 4`, `Community 12`?**
  _High betweenness centrality (0.141) - this node is a cross-community bridge._
- **Why does `simulateV3Swap()` connect `Community 11` to `Community 8`, `Community 5`?**
  _High betweenness centrality (0.055) - this node is a cross-community bridge._
- **Why does `StateWatcher` connect `Community 4` to `Community 0`?**
  _High betweenness centrality (0.040) - this node is a cross-community bridge._
- **Are the 12 inferred relationships involving `executeWithRpcRetry()` (e.g. with `.update()` and `fetchGasPrice()`) actually correct?**
  _`executeWithRpcRetry()` has 12 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.04 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.07 - nodes in this community are weakly interconnected._