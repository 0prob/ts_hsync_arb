# Graph Report - /home/x/t  (2026-04-19)

## Corpus Check
- 88 files · ~55,074 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 608 nodes · 1212 edges · 34 communities detected
- Extraction: 72% EXTRACTED · 28% INFERRED · 0% AMBIGUOUS · INFERRED: 337 edges (avg confidence: 0.8)
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
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]

## God Nodes (most connected - your core abstractions)
1. `RegistryService` - 47 edges
2. `log()` - 34 edges
3. `WorkerPool` - 18 edges
4. `StateWatcher` - 18 edges
5. `RpcManager` - 17 edges
6. `refreshCycles()` - 16 edges
7. `executeWithRpcRetry()` - 16 edges
8. `findArbs()` - 15 edges
9. `main()` - 15 edges
10. `discoverProtocol()` - 15 edges

## Surprising Connections (you probably didn't know these)
- `fetchGasPrice()` --calls--> `executeWithRpcRetry()`  [INFERRED]
  src/execution/gas.ts → /home/x/t/src/enrichment/rpc.ts
- `log()` --calls--> `sendPrivateTx()`  [INFERRED]
  /home/x/t/runner.ts → src/execution/private_tx.ts
- `getCurrentFeeSnapshot()` --calls--> `fetchEIP1559Fees()`  [INFERRED]
  /home/x/t/runner.ts → src/execution/gas.ts
- `refreshCycles()` --calls--> `enumerateCyclesDual()`  [INFERRED]
  /home/x/t/runner.ts → src/routing/enumerate_cycles.ts
- `execute()` --calls--> `buildArbTx()`  [INFERRED]
  /home/x/t/runner.ts → src/execution/build_tx.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.04
Nodes (36): discoverCurveListedFactory(), discover(), discover(), normalizeBalancerState(), normalizeCurveState(), normalizePoolState(), normalizeV2State(), normalizeV3State() (+28 more)

### Community 1 - "Community 1"
Cohesion: 0.06
Nodes (48): applySlippage(), computeProfit(), gasCostWei(), isProfitable(), revertRiskPenalty(), serializeTopology(), PriceOracle, admitPoolsToGraphs() (+40 more)

### Community 2 - "Community 2"
Cohesion: 0.06
Nodes (49): assetStmt(), batchUpsertTokenMeta(), getPoolFee(), getTokenDecimals(), getTokenMeta(), upsertPoolFee(), upsertTokenMeta(), checkpointStmt() (+41 more)

### Community 3 - "Community 3"
Cohesion: 0.05
Nodes (6): RegistryMetaCache, loadPoolMetaCache(), RegistryService, removePoolsFromGraphs(), CompatDatabase, runValidation()

### Community 4 - "Community 4"
Cohesion: 0.07
Nodes (25): throwUnsupportedHypersync(), UnsupportedDecoder, detectReorg(), pick(), discoverCurveRemovals(), discoverPools(), discoverProtocol(), discoveryCheckpointFromNextBlock() (+17 more)

### Community 5 - "Community 5"
Cohesion: 0.09
Nodes (9): executeWithRpcRetry(), isEndpointCapabilityError(), _isMethodUnavailableError(), isRateLimitError(), isRetryableError(), lazyMetrics(), RpcEndpoint, RpcManager (+1 more)

### Community 6 - "Community 6"
Cohesion: 0.09
Nodes (12): createWatcherProtocolHandlers(), commitWatcherState(), handleWatcherLogs(), mergeWatcherState(), persistWatcherState(), reloadWatcherCache(), toTopicArray(), updateTickState() (+4 more)

### Community 7 - "Community 7"
Cohesion: 0.12
Nodes (19): toFiniteNumber(), enumerateCycles(), enumerateCyclesDual(), enumerateCyclesForToken(), pruneByLiquidity(), sortByLogWeight(), annotatePath(), deduplicatePaths() (+11 more)

### Community 8 - "Community 8"
Cohesion: 0.12
Nodes (21): exp(), getBalancerAmountIn(), getBalancerAmountOut(), ln(), powDown(), simulateBalancerSwap(), defaultRates(), getCurveAmountIn() (+13 more)

### Community 9 - "Community 9"
Cohesion: 0.12
Nodes (17): buildArbTx(), buildTransferTx(), resolveFlashLoan(), buildFlashParams(), computeRouteHash(), encodeBalancerHop(), encodeCurveHop(), encodeExecuteArb() (+9 more)

### Community 10 - "Community 10"
Cohesion: 0.12
Nodes (6): buildChunkStateObject(), buildEvaluationChunks(), getStateVersion(), serialisedPathKey(), summariseEvaluationChunks(), WorkerPool

### Community 11 - "Community 11"
Cohesion: 0.23
Nodes (15): divRoundingUp(), mulDiv(), mulDivRoundingUp(), getAmount0Delta(), getAmount1Delta(), getNextSqrtPriceFromAmount0RoundingUp(), getNextSqrtPriceFromAmount1RoundingDown(), getNextSqrtPriceFromInput() (+7 more)

### Community 12 - "Community 12"
Cohesion: 0.23
Nodes (14): mergeStateIntoCache(), reloadCacheFromRegistry(), buildGraph(), buildHubGraph(), createSwapEdge(), deserializeTopology(), getFeeBps(), getLiveStateRef() (+6 more)

### Community 13 - "Community 13"
Cohesion: 0.16
Nodes (2): routeKeyFromEdges(), RouteCache

### Community 14 - "Community 14"
Cohesion: 0.24
Nodes (4): NonceManager, dryRun(), logFailure(), sendTx()

### Community 15 - "Community 15"
Cohesion: 0.44
Nodes (7): jsonRpc(), racePublicRPCs(), sendBundleAlchemy(), sendBundleBloXroute(), sendPrivateTransaction(), sendPrivateTx(), sendViaBloXroute()

### Community 16 - "Community 16"
Cohesion: 0.7
Nodes (4): estimateGasCostWei(), rankRoutes(), scoreRoute(), selectBestRoute()

### Community 17 - "Community 17"
Cohesion: 0.5
Nodes (2): getBalancerTokens(), enrichTokens()

### Community 18 - "Community 18"
Cohesion: 0.5
Nodes (2): getCurveTokens(), enrichTokens()

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

### Community 31 - "Community 31"
Cohesion: 1.0
Nodes (0): 

### Community 32 - "Community 32"
Cohesion: 1.0
Nodes (0): 

### Community 33 - "Community 33"
Cohesion: 1.0
Nodes (0): 

## Knowledge Gaps
- **Thin community `Community 19`** (2 nodes): `decode()`, `curve_crypto_factory.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 20`** (2 nodes): `decode()`, `curve_stable_factory.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 21`** (2 nodes): `decode()`, `quickswap_v2.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 22`** (2 nodes): `decode()`, `quickswap_v3.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 23`** (2 nodes): `sushiswap_v2.ts`, `decode()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 24`** (2 nodes): `sushiswap_v3.ts`, `decode()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 25`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 26`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 27`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 28`** (1 nodes): `abi_fragments.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 29`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 30`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 31`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 32`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 33`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `log()` connect `Community 4` to `Community 0`, `Community 1`, `Community 3`, `Community 6`, `Community 7`, `Community 14`, `Community 15`?**
  _High betweenness centrality (0.133) - this node is a cross-community bridge._
- **Why does `RegistryService` connect `Community 3` to `Community 0`, `Community 1`, `Community 2`, `Community 4`, `Community 6`?**
  _High betweenness centrality (0.122) - this node is a cross-community bridge._
- **Why does `executeWithRpcRetry()` connect `Community 5` to `Community 0`, `Community 9`?**
  _High betweenness centrality (0.082) - this node is a cross-community bridge._
- **Are the 20 inferred relationships involving `log()` (e.g. with `fetchAllLogs()` and `discoverProtocol()`) actually correct?**
  _`log()` has 20 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.04 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._