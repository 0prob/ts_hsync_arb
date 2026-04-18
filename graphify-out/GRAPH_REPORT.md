# Graph Report - .  (2026-04-18)

## Corpus Check
- 83 files · ~52,533 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 581 nodes · 1205 edges · 21 communities detected
- Extraction: 74% EXTRACTED · 26% INFERRED · 0% AMBIGUOUS · INFERRED: 310 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Token & Pool Metadata|Token & Pool Metadata]]
- [[_COMMUNITY_Arbitrage Profitability & Metrics|Arbitrage Profitability & Metrics]]
- [[_COMMUNITY_Protocol Discovery & Decoding|Protocol Discovery & Decoding]]
- [[_COMMUNITY_Transaction Building & Encoding|Transaction Building & Encoding]]
- [[_COMMUNITY_Token Enrichment & Decoding|Token Enrichment & Decoding]]
- [[_COMMUNITY_Cycle Enumeration & Routing|Cycle Enumeration & Routing]]
- [[_COMMUNITY_Route Cache Management|Route Cache Management]]
- [[_COMMUNITY_State & Reorg Detection|State & Reorg Detection]]
- [[_COMMUNITY_Pool State Normalization|Pool State Normalization]]
- [[_COMMUNITY_Nonce Management|Nonce Management]]
- [[_COMMUNITY_AMM Swap Simulation|AMM Swap Simulation]]
- [[_COMMUNITY_UniswapV3 Math|UniswapV3 Math]]
- [[_COMMUNITY_Bundle Submission & RPC|Bundle Submission & RPC]]
- [[_COMMUNITY_Route Scoring|Route Scoring]]
- [[_COMMUNITY_Entry Point|Entry Point]]
- [[_COMMUNITY_Entry Point|Entry Point]]
- [[_COMMUNITY_Entry Point|Entry Point]]
- [[_COMMUNITY_Entry Point|Entry Point]]
- [[_COMMUNITY_Entry Point|Entry Point]]
- [[_COMMUNITY_Entry Point|Entry Point]]
- [[_COMMUNITY_Entry Point|Entry Point]]

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
- `fetchAllLogs()` --calls--> `log()`  [INFERRED]
  src/hypersync/paginate.ts → runner.ts
- `discoverProtocol()` --calls--> `log()`  [INFERRED]
  src/discovery/discover.ts → runner.ts
- `discoverCurveRemovals()` --calls--> `log()`  [INFERRED]
  src/discovery/discover.ts → runner.ts
- `discoverPools()` --calls--> `log()`  [INFERRED]
  src/discovery/discover.ts → runner.ts
- `discoverV3Pools()` --calls--> `log()`  [INFERRED]
  src/discovery/uniswap_v3.ts → runner.ts

## Communities

### Community 0 - "Token & Pool Metadata"
Cohesion: 0.05
Nodes (45): assetStmt(), batchUpsertTokenMeta(), getPoolFee(), getTokenDecimals(), getTokenMeta(), upsertPoolFee(), upsertTokenMeta(), lowerCaseAddressList() (+37 more)

### Community 1 - "Arbitrage Profitability & Metrics"
Cohesion: 0.06
Nodes (50): applySlippage(), computeProfit(), gasCostWei(), isProfitable(), revertRiskPenalty(), startTui(), startMetricsServer(), stopMetricsServer() (+42 more)

### Community 2 - "Protocol Discovery & Decoding"
Cohesion: 0.05
Nodes (15): throwUnsupportedHypersync(), UnsupportedDecoder, discoverCurveRemovals(), discoverPools(), discoverProtocol(), discoveryCheckpointFromNextBlock(), fetchAllLogs(), RegistryService (+7 more)

### Community 3 - "Transaction Building & Encoding"
Cohesion: 0.06
Nodes (26): buildArbTx(), buildTransferTx(), resolveFlashLoan(), buildFlashParams(), computeRouteHash(), encodeBalancerHop(), encodeCurveHop(), encodeExecuteArb() (+18 more)

### Community 4 - "Token Enrichment & Decoding"
Cohesion: 0.06
Nodes (18): getBalancerTokens(), enrichTokens(), getCurveTokens(), enrichTokens(), PollUniv2, readContractWithRetry(), rpcShortUrl(), throttledMap() (+10 more)

### Community 5 - "Cycle Enumeration & Routing"
Cohesion: 0.09
Nodes (27): toFiniteNumber(), enumerateCycles(), enumerateCyclesDual(), enumerateCyclesForToken(), pruneByLiquidity(), sortByLogWeight(), annotatePath(), deduplicatePaths() (+19 more)

### Community 6 - "Route Cache Management"
Cohesion: 0.07
Nodes (8): routeKeyFromEdges(), RouteCache, buildChunkStateObject(), buildEvaluationChunks(), getStateVersion(), serialisedPathKey(), summariseEvaluationChunks(), WorkerPool

### Community 7 - "State & Reorg Detection"
Cohesion: 0.08
Nodes (16): mergeStateIntoCache(), reloadCacheFromRegistry(), detectReorg(), pick(), createWatcherProtocolHandlers(), commitWatcherState(), handleWatcherLogs(), mergeWatcherState() (+8 more)

### Community 8 - "Pool State Normalization"
Cohesion: 0.08
Nodes (19): normalizeBalancerState(), normalizeCurveState(), normalizePoolState(), normalizeV2State(), normalizeV3State(), validatePoolState(), fetchAndNormalizeBalancerPool(), fetchBalancerPoolState() (+11 more)

### Community 9 - "Nonce Management"
Cohesion: 0.12
Nodes (13): NonceManager, PriceOracle, checkpointStmt(), getCheckpoint(), getGlobalCheckpoint(), getRollbackGuard(), rollbackToBlock(), setCheckpoint() (+5 more)

### Community 10 - "AMM Swap Simulation"
Cohesion: 0.13
Nodes (21): exp(), getBalancerAmountIn(), getBalancerAmountOut(), ln(), powDown(), simulateBalancerSwap(), defaultRates(), getCurveAmountIn() (+13 more)

### Community 11 - "UniswapV3 Math"
Cohesion: 0.23
Nodes (15): divRoundingUp(), mulDiv(), mulDivRoundingUp(), getAmount0Delta(), getAmount1Delta(), getNextSqrtPriceFromAmount0RoundingUp(), getNextSqrtPriceFromAmount1RoundingDown(), getNextSqrtPriceFromInput() (+7 more)

### Community 12 - "Bundle Submission & RPC"
Cohesion: 0.44
Nodes (7): jsonRpc(), racePublicRPCs(), sendBundleAlchemy(), sendBundleBloXroute(), sendPrivateTransaction(), sendPrivateTx(), sendViaBloXroute()

### Community 13 - "Route Scoring"
Cohesion: 0.7
Nodes (4): estimateGasCostWei(), rankRoutes(), scoreRoute(), selectBestRoute()

### Community 14 - "Entry Point"
Cohesion: 1.0
Nodes (0): 

### Community 15 - "Entry Point"
Cohesion: 1.0
Nodes (0): 

### Community 16 - "Entry Point"
Cohesion: 1.0
Nodes (0): 

### Community 17 - "Entry Point"
Cohesion: 1.0
Nodes (0): 

### Community 18 - "Entry Point"
Cohesion: 1.0
Nodes (0): 

### Community 19 - "Entry Point"
Cohesion: 1.0
Nodes (0): 

### Community 20 - "Entry Point"
Cohesion: 1.0
Nodes (0): 

## Knowledge Gaps
- **Thin community `Entry Point`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Entry Point`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Entry Point`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Entry Point`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Entry Point`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Entry Point`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Entry Point`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `RegistryService` connect `Protocol Discovery & Decoding` to `Token & Pool Metadata`, `Arbitrage Profitability & Metrics`, `Nonce Management`, `State & Reorg Detection`?**
  _High betweenness centrality (0.117) - this node is a cross-community bridge._
- **Why does `log()` connect `Arbitrage Profitability & Metrics` to `Protocol Discovery & Decoding`, `Cycle Enumeration & Routing`, `State & Reorg Detection`, `Nonce Management`, `Bundle Submission & RPC`?**
  _High betweenness centrality (0.071) - this node is a cross-community bridge._
- **Why does `simulateV3Swap()` connect `UniswapV3 Math` to `Nonce Management`, `AMM Swap Simulation`?**
  _High betweenness centrality (0.038) - this node is a cross-community bridge._
- **Are the 19 inferred relationships involving `log()` (e.g. with `fetchAllLogs()` and `discoverProtocol()`) actually correct?**
  _`log()` has 19 INFERRED edges - model-reasoned connections that need verification._
- **Should `Token & Pool Metadata` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `Arbitrage Profitability & Metrics` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._
- **Should `Protocol Discovery & Decoding` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._