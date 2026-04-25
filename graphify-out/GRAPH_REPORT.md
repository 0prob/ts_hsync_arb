# Graph Report - t  (2026-04-25)

## Corpus Check
- 150 files · ~159,416 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 949 nodes · 2103 edges · 20 communities detected
- Extraction: 76% EXTRACTED · 24% INFERRED · 0% AMBIGUOUS · INFERRED: 506 edges (avg confidence: 0.8)
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

## God Nodes (most connected - your core abstractions)
1. `get()` - 69 edges
2. `RegistryService` - 61 edges
3. `StateWatcher` - 27 edges
4. `log()` - 24 edges
5. `normalizeProtocolKey()` - 23 edges
6. `WorkerPool` - 20 edges
7. `RpcManager` - 17 edges
8. `PriceOracle` - 16 edges
9. `executeWithRpcRetry()` - 15 edges
10. `discoverProtocol()` - 14 edges

## Surprising Connections (you probably didn't know these)
- `stop()` --calls--> `withFakeEndpoints()`  [INFERRED]
  src/state/poller_base.ts → scripts/test_rpc_retry.ts
- `log()` --calls--> `enrichDiscoveredPools()`  [INFERRED]
  runner.ts → src/discovery/discover.ts
- `log()` --calls--> `discoverProtocol()`  [INFERRED]
  runner.ts → src/discovery/discover.ts
- `log()` --calls--> `discoverCurveRemovals()`  [INFERRED]
  runner.ts → src/discovery/discover.ts
- `log()` --calls--> `discoverPoolsWithDeps()`  [INFERRED]
  runner.ts → src/discovery/discover.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.03
Nodes (50): assessmentNetProfit(), assessRouteResult(), compareAssessmentProfit(), getAssessmentOptimizationOptions(), getOptimizationOptions(), minProfitInTokenUnits(), gasEstimateCacheKeyForRoute(), parsePositiveInteger() (+42 more)

### Community 1 - "Community 1"
Cohesion: 0.04
Nodes (51): mergeStateIntoCache(), reloadCacheFromRegistry(), defaultRatesForDecimals(), normalizeBalancerState(), normalizeCurveState(), normalizePoolState(), normalizeTokenDecimalsList(), normalizeV2State() (+43 more)

### Community 2 - "Community 2"
Cohesion: 0.05
Nodes (48): assetStmt(), batchUpsertTokenMeta(), getPoolFee(), getTokenDecimals(), getTokenMeta(), normalizePoolAddress(), normalizeTokenAddress(), normalizeTokenDecimals() (+40 more)

### Community 3 - "Community 3"
Cohesion: 0.05
Nodes (45): toFiniteNumber(), takeTopNBy(), seedNewPoolsIntoStateCache(), enumerateCycles(), enumerateCyclesDual(), enumerateCyclesForToken(), pruneByLiquidity(), resolvePhaseBudget() (+37 more)

### Community 4 - "Community 4"
Cohesion: 0.04
Nodes (18): discover(), discoverCurveListedFactory(), discoverStartIndex(), metadataFactoryIndex(), discover(), assertDecodedLogsAligned(), buildDiscoveryScanQuery(), decodeDiscoveryLogs() (+10 more)

### Community 5 - "Community 5"
Cohesion: 0.06
Nodes (28): getDiscoveryQuerySpec(), getLiveStateRef(), NonceManager, scoreForCandidate(), normalizeEvmAddress(), PriceOracle, batchRemovePools(), getActivePoolCount() (+20 more)

### Community 6 - "Community 6"
Cohesion: 0.05
Nodes (36): enrichDiscoveredPools(), fetchGasPrice(), _num(), _parseSafeNonNegativeConfigNumber(), executeWithRpcRetry(), isEndpointCapabilityError(), _isMethodUnavailableError(), isRateLimitError() (+28 more)

### Community 7 - "Community 7"
Cohesion: 0.05
Nodes (39): exp(), getBalancerAmountIn(), getBalancerAmountOut(), ln(), powDown(), simulateBalancerSwap(), toBigInt(), defaultRates() (+31 more)

### Community 8 - "Community 8"
Cohesion: 0.07
Nodes (37): assertValidRouteForExecution(), buildArbTx(), buildTransferTx(), resolveFlashLoan(), buildFlashParams(), callbackProtocolId(), computeRouteHash(), encodeBalancerHop() (+29 more)

### Community 9 - "Community 9"
Cohesion: 0.08
Nodes (26): detectReorg(), pick(), topic0sForSignatures(), chunk(), classifyWatcherPollError(), compareRollbackGuards(), dedupeWatcherLogs(), isRollbackGuardMismatchError() (+18 more)

### Community 10 - "Community 10"
Cohesion: 0.09
Nodes (8): getBalancerTokens(), normalizeAddressList(), enrichTokens(), getCurveTokens(), enrichTokens(), normalizeCurveTokenList(), decode(), isNoDataReadContractError()

### Community 11 - "Community 11"
Cohesion: 0.11
Nodes (17): throwUnsupportedHypersync(), UnsupportedDecoder, fetchAllLogs(), fetchAllLogsWithClient(), isTerminalBoundedCursor(), pageLogsFromResponse(), parseBlockInteger(), parseOptionalBlockInteger() (+9 more)

### Community 12 - "Community 12"
Cohesion: 0.09
Nodes (7): clearGasEstimateCache(), classifyWatcherHaltReason(), recordWatcherHalt(), stopMetricsServer(), hasValidPoolEdges(), profitFromResult(), RouteCache

### Community 13 - "Community 13"
Cohesion: 0.2
Nodes (18): divRoundingUp(), mulDiv(), mulDivRoundingUp(), getAmount0Delta(), getAmount1Delta(), getNextSqrtPriceFromAmount0RoundingUp(), getNextSqrtPriceFromAmount1RoundingDown(), getNextSqrtPriceFromInput() (+10 more)

### Community 14 - "Community 14"
Cohesion: 0.17
Nodes (18): jsonRpc(), polygonPrivateMempoolHeaders(), privateMempoolSupportsBundles(), racePublicRPCs(), rpcShortUrl(), sendBundleAlchemy(), sendPolygonPrivateTransaction(), sendPrivateBundle() (+10 more)

### Community 15 - "Community 15"
Cohesion: 0.21
Nodes (13): appendCapturedLog(), colorize(), formatLastPass(), formatLogs(), formatStatus(), installOutputGuard(), normalizeOpportunity(), pad() (+5 more)

### Community 16 - "Community 16"
Cohesion: 0.28
Nodes (15): lowerCaseAddressList(), mapArbHistoryRow(), mapPoolMetaRow(), mapPoolRow(), mapStalePoolRow(), normalizeAddress(), normalizeAddressList(), parseJson() (+7 more)

### Community 17 - "Community 17"
Cohesion: 0.23
Nodes (5): evaluateCandidatePipeline(), recordAssessmentReject(), normalizeCandidateLimit(), selectOptimizationCandidates(), shouldOptimizeCandidate()

### Community 18 - "Community 18"
Cohesion: 0.2
Nodes (2): normalizeChangedPools(), normalizePoolAddressLike()

### Community 19 - "Community 19"
Cohesion: 0.38
Nodes (3): fetchAbi(), fetchAbiWithRetry(), sleep()

## Knowledge Gaps
- **Thin community `Community 18`** (12 nodes): `normalizeChangedPools()`, `normalizeEventPayload()`, `normalizePoolAddressLike()`, `normalizeReorgBlock()`, `configureWatcherCallbacks()`, `createArbScheduler()`, `createShutdownHandler()`, `errorMessage()`, `test_coordinator.ts`, `test_event_bridge.ts`, `lifecycle.ts`, `events.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `RegistryService` connect `Community 4` to `Community 1`, `Community 2`, `Community 5`, `Community 9`, `Community 12`?**
  _High betweenness centrality (0.092) - this node is a cross-community bridge._
- **Why does `get()` connect `Community 5` to `Community 0`, `Community 1`, `Community 2`, `Community 3`, `Community 4`, `Community 7`, `Community 8`, `Community 11`, `Community 12`, `Community 13`?**
  _High betweenness centrality (0.084) - this node is a cross-community bridge._
- **Why does `log()` connect `Community 1` to `Community 0`, `Community 3`, `Community 4`, `Community 5`, `Community 6`, `Community 7`, `Community 11`, `Community 14`?**
  _High betweenness centrality (0.043) - this node is a cross-community bridge._
- **Are the 68 inferred relationships involving `get()` (e.g. with `fetchAllLogsWithClient()` and `getDiscoveryQuerySpec()`) actually correct?**
  _`get()` has 68 INFERRED edges - model-reasoned connections that need verification._
- **Are the 20 inferred relationships involving `log()` (e.g. with `enrichDiscoveredPools()` and `discoverProtocol()`) actually correct?**
  _`log()` has 20 INFERRED edges - model-reasoned connections that need verification._
- **Are the 17 inferred relationships involving `normalizeProtocolKey()` (e.g. with `protocolSupportsRouting()` and `getProtocolKind()`) actually correct?**
  _`normalizeProtocolKey()` has 17 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.03 - nodes in this community are weakly interconnected._