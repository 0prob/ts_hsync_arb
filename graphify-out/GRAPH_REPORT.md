# Graph Report - t  (2026-04-24)

## Corpus Check
- 185 files · ~177,053 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 940 nodes · 2111 edges · 16 communities detected
- Extraction: 70% EXTRACTED · 30% INFERRED · 0% AMBIGUOUS · INFERRED: 638 edges (avg confidence: 0.8)
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

## God Nodes (most connected - your core abstractions)
1. `get()` - 63 edges
2. `RegistryService` - 61 edges
3. `log()` - 33 edges
4. `StateWatcher` - 27 edges
5. `discoverProtocol()` - 24 edges
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
- `log()` --calls--> `fetchAllLogsWithClient()`  [INFERRED]
  runner.ts → src/hypersync/paginate.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.03
Nodes (40): assessmentNetProfit(), assessRouteResult(), compareAssessmentProfit(), getAssessmentOptimizationOptions(), getOptimizationOptions(), minProfitInTokenUnits(), parsePositiveInteger(), parseRunnerArgs() (+32 more)

### Community 1 - "Community 1"
Cohesion: 0.04
Nodes (41): fetchAbi(), fetchAbiWithRetry(), sleep(), throwUnsupportedHypersync(), UnsupportedDecoder, decode(), discover(), discoverCurveListedFactory() (+33 more)

### Community 2 - "Community 2"
Cohesion: 0.06
Nodes (38): getLiveStateRef(), NonceManager, getPathFreshness(), normalisePoolAddress(), PriceOracle, assetStmt(), batchUpsertTokenMeta(), getPoolFee() (+30 more)

### Community 3 - "Community 3"
Cohesion: 0.04
Nodes (45): mergeStateIntoCache(), reloadCacheFromRegistry(), defaultRates(), getCurveAmountIn(), getCurveAmountOut(), getD(), getY(), simulateCurveSwap() (+37 more)

### Community 4 - "Community 4"
Cohesion: 0.05
Nodes (40): defaultRatesForDecimals(), normalizeBalancerState(), normalizeCurveState(), normalizePoolState(), normalizeTokenDecimalsList(), normalizeV2State(), normalizeV3State(), resolveV2FeeNumerator() (+32 more)

### Community 5 - "Community 5"
Cohesion: 0.05
Nodes (33): getBalancerTokens(), normalizeAddressList(), enrichTokens(), getCurveTokens(), enrichTokens(), normalizeCurveTokenList(), _num(), _parseSafeNonNegativeConfigNumber() (+25 more)

### Community 6 - "Community 6"
Cohesion: 0.06
Nodes (41): lowerCaseAddressList(), mapArbHistoryRow(), mapPoolMetaRow(), mapPoolRow(), mapStalePoolRow(), normalizeAddress(), normalizeAddressList(), parseJson() (+33 more)

### Community 7 - "Community 7"
Cohesion: 0.06
Nodes (31): toFiniteNumber(), takeTopNBy(), seedNewPoolsIntoStateCache(), enumerateCycles(), enumerateCyclesDual(), enumerateCyclesForToken(), pruneByLiquidity(), resolvePhaseBudget() (+23 more)

### Community 8 - "Community 8"
Cohesion: 0.07
Nodes (39): assertValidRouteForExecution(), buildArbTx(), buildTransferTx(), resolveFlashLoan(), buildFlashParams(), callbackProtocolId(), computeRouteHash(), encodeBalancerHop() (+31 more)

### Community 9 - "Community 9"
Cohesion: 0.06
Nodes (3): validateAllPools(), RegistryService, runValidation()

### Community 10 - "Community 10"
Cohesion: 0.09
Nodes (26): exp(), getBalancerAmountIn(), getBalancerAmountOut(), ln(), powDown(), simulateBalancerSwap(), toBigInt(), annotatePath() (+18 more)

### Community 11 - "Community 11"
Cohesion: 0.09
Nodes (25): appendCapturedLog(), colorize(), formatLogs(), formatStatus(), installOutputGuard(), normalizeOpportunity(), pad(), renderFrame() (+17 more)

### Community 12 - "Community 12"
Cohesion: 0.08
Nodes (16): gasEstimateCacheKeyForRoute(), routeKeyFromEdges(), deserializeTopology(), routeExecutionCacheKey(), routeIdentityFromEdges(), routeIdentityFromSerializedPath(), evaluatePaths(), evaluatePathsParallel() (+8 more)

### Community 13 - "Community 13"
Cohesion: 0.16
Nodes (13): evaluateCandidatePipeline(), scoreForCandidate(), selectOptimizationCandidates(), shouldOptimizeCandidate(), bigintToApproxNumber(), ceilDiv(), estimateGasCostWei(), gasCostInStartTokenUnits() (+5 more)

### Community 14 - "Community 14"
Cohesion: 0.14
Nodes (3): clearGasEstimateCache(), normalisePoolAddress(), RouteCache

### Community 15 - "Community 15"
Cohesion: 0.41
Nodes (10): divRoundingUp(), mulDiv(), mulDivRoundingUp(), getAmount0Delta(), getAmount1Delta(), getNextSqrtPriceFromAmount0RoundingUp(), getNextSqrtPriceFromAmount1RoundingDown(), getNextSqrtPriceFromInput() (+2 more)

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `log()` connect `Community 4` to `Community 0`, `Community 1`, `Community 2`, `Community 3`, `Community 8`, `Community 9`, `Community 10`, `Community 11`?**
  _High betweenness centrality (0.083) - this node is a cross-community bridge._
- **Why does `RegistryService` connect `Community 9` to `Community 1`, `Community 2`, `Community 3`, `Community 4`, `Community 6`, `Community 14`?**
  _High betweenness centrality (0.080) - this node is a cross-community bridge._
- **Why does `get()` connect `Community 2` to `Community 1`, `Community 3`, `Community 4`, `Community 7`, `Community 8`, `Community 10`, `Community 12`, `Community 14`?**
  _High betweenness centrality (0.052) - this node is a cross-community bridge._
- **Are the 62 inferred relationships involving `get()` (e.g. with `fetchAllLogsWithClient()` and `getDiscoveryQuerySpec()`) actually correct?**
  _`get()` has 62 INFERRED edges - model-reasoned connections that need verification._
- **Are the 29 inferred relationships involving `log()` (e.g. with `quoteBasedLogWeight()` and `edgeSpotLogWeight()`) actually correct?**
  _`log()` has 29 INFERRED edges - model-reasoned connections that need verification._
- **Are the 18 inferred relationships involving `discoverProtocol()` (e.g. with `discover()` and `getCheckpoint()`) actually correct?**
  _`discoverProtocol()` has 18 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.03 - nodes in this community are weakly interconnected._