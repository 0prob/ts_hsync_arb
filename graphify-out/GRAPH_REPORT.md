# Graph Report - t  (2026-04-24)

## Corpus Check
- 185 files · ~176,090 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 932 nodes · 2093 edges · 18 communities detected
- Extraction: 70% EXTRACTED · 30% INFERRED · 0% AMBIGUOUS · INFERRED: 634 edges (avg confidence: 0.8)
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

## God Nodes (most connected - your core abstractions)
1. `get()` - 63 edges
2. `RegistryService` - 61 edges
3. `log()` - 33 edges
4. `StateWatcher` - 27 edges
5. `discoverProtocol()` - 23 edges
6. `WorkerPool` - 20 edges
7. `RpcManager` - 17 edges
8. `discoverCurveRemovals()` - 17 edges
9. `PriceOracle` - 16 edges
10. `executeWithRpcRetry()` - 16 edges

## Surprising Connections (you probably didn't know these)
- `normalizeCurveState()` --calls--> `defaultRates()`  [INFERRED]
  src/state/normalizer.ts → /home/x/t/src/math/curve.ts
- `log()` --calls--> `quoteBasedLogWeight()`  [INFERRED]
  runner.ts → src/routing/finder.ts
- `log()` --calls--> `edgeSpotLogWeight()`  [INFERRED]
  runner.ts → src/routing/finder.ts
- `log()` --calls--> `discoverCurveListedFactory()`  [INFERRED]
  runner.ts → src/protocols/curve_list_factory.ts
- `log()` --calls--> `sendPrivateBundle()`  [INFERRED]
  runner.ts → /home/x/t/src/execution/private_tx.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.03
Nodes (38): assessmentNetProfit(), assessRouteResult(), compareAssessmentProfit(), getAssessmentOptimizationOptions(), getOptimizationOptions(), minProfitInTokenUnits(), parsePositiveInteger(), parseRunnerArgs() (+30 more)

### Community 1 - "Community 1"
Cohesion: 0.06
Nodes (45): discoverPools(), discoverPoolsWithDeps(), getDiscoveryQuerySpec(), getLiveStateRef(), getPathFreshness(), normalisePoolAddress(), PriceOracle, assetStmt() (+37 more)

### Community 2 - "Community 2"
Cohesion: 0.04
Nodes (34): getBalancerTokens(), normalizeAddressList(), enrichTokens(), getCurveTokens(), enrichTokens(), normalizeCurveTokenList(), fetchGasPrice(), _num() (+26 more)

### Community 3 - "Community 3"
Cohesion: 0.04
Nodes (34): toFiniteNumber(), takeTopNBy(), seedNewPoolsIntoStateCache(), enumerateCycles(), enumerateCyclesDual(), enumerateCyclesForToken(), pruneByLiquidity(), resolvePhaseBudget() (+26 more)

### Community 4 - "Community 4"
Cohesion: 0.05
Nodes (38): mergeStateIntoCache(), reloadCacheFromRegistry(), detectReorg(), pick(), getPools(), commitStates(), createRegistryStub(), createV2State() (+30 more)

### Community 5 - "Community 5"
Cohesion: 0.04
Nodes (25): fetchAbi(), fetchAbiWithRetry(), sleep(), throwUnsupportedHypersync(), UnsupportedDecoder, decode(), assertDecodedLogsAligned(), buildDiscoveryScanQuery() (+17 more)

### Community 6 - "Community 6"
Cohesion: 0.06
Nodes (33): defaultRatesForDecimals(), normalizeBalancerState(), normalizeCurveState(), normalizePoolState(), normalizeTokenDecimalsList(), normalizeV2State(), normalizeV3State(), resolveV2FeeNumerator() (+25 more)

### Community 7 - "Community 7"
Cohesion: 0.07
Nodes (42): parsePoolMetadataValue(), upsertPoolFee(), lowerCaseAddressList(), mapArbHistoryRow(), mapPoolMetaRow(), mapPoolRow(), mapStalePoolRow(), normalizeAddress() (+34 more)

### Community 8 - "Community 8"
Cohesion: 0.05
Nodes (5): discoverCurveListedFactory(), getPoolAddressesForProtocol(), validateAllPools(), RegistryService, runValidation()

### Community 9 - "Community 9"
Cohesion: 0.09
Nodes (26): exp(), getBalancerAmountIn(), getBalancerAmountOut(), ln(), powDown(), simulateBalancerSwap(), toBigInt(), annotatePath() (+18 more)

### Community 10 - "Community 10"
Cohesion: 0.08
Nodes (17): gasEstimateCacheKeyForRoute(), deserializeTopology(), getPathHopCount(), routeExecutionCacheKey(), routeIdentityFromEdges(), routeIdentityFromSerializedPath(), evaluatePaths(), evaluatePathsParallel() (+9 more)

### Community 11 - "Community 11"
Cohesion: 0.09
Nodes (26): assertValidRouteForExecution(), buildArbTx(), buildTransferTx(), resolveFlashLoan(), buildFlashParams(), callbackProtocolId(), computeRouteHash(), encodeBalancerHop() (+18 more)

### Community 12 - "Community 12"
Cohesion: 0.09
Nodes (23): colorize(), formatLogs(), formatStatus(), normalizeOpportunity(), pad(), renderFrame(), section(), startTui() (+15 more)

### Community 13 - "Community 13"
Cohesion: 0.18
Nodes (13): NonceManager, classifySubmissionError(), clearTrackedReceipt(), dryRun(), logFailure(), mapWithConcurrency(), pollPendingReceipts(), pollTrackedReceipt() (+5 more)

### Community 14 - "Community 14"
Cohesion: 0.16
Nodes (13): evaluateCandidatePipeline(), scoreForCandidate(), selectOptimizationCandidates(), shouldOptimizeCandidate(), bigintToApproxNumber(), ceilDiv(), estimateGasCostWei(), gasCostInStartTokenUnits() (+5 more)

### Community 15 - "Community 15"
Cohesion: 0.41
Nodes (10): divRoundingUp(), mulDiv(), mulDivRoundingUp(), getAmount0Delta(), getAmount1Delta(), getNextSqrtPriceFromAmount0RoundingUp(), getNextSqrtPriceFromAmount1RoundingDown(), getNextSqrtPriceFromInput() (+2 more)

### Community 16 - "Community 16"
Cohesion: 0.36
Nodes (9): jsonRpc(), polygonPrivateMempoolHeaders(), privateMempoolSupportsBundles(), racePublicRPCs(), sendBundleAlchemy(), sendPolygonPrivateTransaction(), sendPrivateBundle(), sendPrivateTransaction() (+1 more)

### Community 17 - "Community 17"
Cohesion: 0.43
Nodes (7): defaultRates(), getCurveAmountIn(), getCurveAmountOut(), getD(), getY(), simulateCurveSwap(), toXp()

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `log()` connect `Community 6` to `Community 0`, `Community 1`, `Community 4`, `Community 5`, `Community 8`, `Community 9`, `Community 12`, `Community 13`, `Community 16`?**
  _High betweenness centrality (0.081) - this node is a cross-community bridge._
- **Why does `RegistryService` connect `Community 8` to `Community 1`, `Community 3`, `Community 4`, `Community 5`, `Community 6`, `Community 7`?**
  _High betweenness centrality (0.081) - this node is a cross-community bridge._
- **Why does `get()` connect `Community 1` to `Community 3`, `Community 4`, `Community 5`, `Community 6`, `Community 9`, `Community 10`, `Community 11`, `Community 13`?**
  _High betweenness centrality (0.053) - this node is a cross-community bridge._
- **Are the 62 inferred relationships involving `get()` (e.g. with `fetchAllLogsWithClient()` and `getDiscoveryQuerySpec()`) actually correct?**
  _`get()` has 62 INFERRED edges - model-reasoned connections that need verification._
- **Are the 29 inferred relationships involving `log()` (e.g. with `quoteBasedLogWeight()` and `edgeSpotLogWeight()`) actually correct?**
  _`log()` has 29 INFERRED edges - model-reasoned connections that need verification._
- **Are the 17 inferred relationships involving `discoverProtocol()` (e.g. with `getCheckpoint()` and `getPoolCountForProtocol()`) actually correct?**
  _`discoverProtocol()` has 17 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.03 - nodes in this community are weakly interconnected._