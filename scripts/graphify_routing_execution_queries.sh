#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_PATH="${1:-src}"

cd "$ROOT_DIR"

run() {
  printf '\n==> %s\n' "$*"
  "$@"
}

run graphify update "$TARGET_PATH"

# Routing and execution: highest-signal questions first.
run graphify query "Trace the routing and execution hot path from discoverPools through normalizePoolState, buildGraph and buildHubGraph, enumerateCyclesDual, evaluatePathsParallel, scoreRoute and computeProfit, buildArbTx, recommendGasParams, and sendTx. Highlight state handoffs, rejection points, and irreversible decisions."

run graphify query "Where does routing latency or path explosion concentrate across findArbPaths, deduplicatePaths, annotatePath, enumerateCyclesDual, optimizeInputAmount, evaluatePathsParallel, buildEvaluationChunks, and WorkerPool? Identify likely CPU hotspots, serial bottlenecks, and duplicate work."

run graphify query "Trace how live pool state enters, is normalized, merged, cached, invalidated, and finally consumed by simulateHop and simulateRoute. Focus on discoverPools, fetchBalancerPoolState, fetchAndNormalizeBalancerPool, normalizePoolState, mergeStateIntoCache, RouteCache, StateWatcher, and watcher refresh paths. Identify stale-state and mismatched-state risks."

run graphify query "Explain how route identity and execution identity are represented across routeKeyFromEdges, serialisedPathKey, gasEstimateCacheKeyForRoute, computeRouteHash, encodeRoute, and buildFlashParams. Identify where order sensitivity, token direction, or serialization differences could cause cache misses, duplicates, or wrong execution assumptions."

run graphify query "Which functions silently reject, zero-out, or demote routes instead of throwing hard failures, especially shouldPruneEdge, edgeSpotLogWeight, simulateHop, simulateRoute, optimizeInputAmount, scoreRoute, computeProfit, and buildArbTx? Distinguish false negatives from explicit safety checks."

run graphify query "How does evaluatePathsParallel partition and move work across buildEvaluationChunks, summariseEvaluationChunks, serialiseEvaluationPaths, buildChunkStateObject, WorkerPool, and persistent_worker? Identify synchronization costs, repeated state transfer, and opportunities to improve locality or reduce IPC."

run graphify query "Compare route ranking and execution gating across edgeSpotLogWeight, pathCumulativeFeesBps, scoreRoute, rankRoutes, computeProfit, and buildArbTx. Where can a route rank well but still be unsafe, stale, denomination-mismatched, or unexecutable?"

run graphify query "Trace the execution hot path from fetchGasPrice, fetchEIP1559Fees, and estimateGas through recommendGasParams, NonceManager, signTransaction, sendPrivateTx or sendPrivateBundle, and receipt polling in sendTx. Highlight retry logic, fallback behavior, nonce desync risk, and where execution can fail after a successful dry run."

run graphify query "Which inferred relationships around executeWithRpcRetry, fetchGasPrice, recommendGasParams, buildArbTx, simulateHop, simulateV3Swap, and WorkerPool most affect execution correctness or latency? Prioritize the inferred edges that should be verified first in source."

run graphify query "Why do RegistryService, StateWatcher, WorkerPool, executeWithRpcRetry, RoutingGraph, RouteCache, and NonceManager act as graph bridges? Identify couplings that make routing slower, make execution riskier, or suggest refactor boundaries."

run graphify query "Inspect whether scoreRoute and estimateGasCostWei compare values in consistent units with computeProfit and PriceOracle, especially when the route start token is not WMATIC. Trace all paths where gas-denominated and token-denominated profitability are mixed."

# Targeted path tracing for the main handoffs.
run graphify path "discoverPools()" "buildGraph()"
run graphify path "normalizePoolState()" "simulateRoute()"
run graphify path "mergeStateIntoCache()" "simulateHop()"
run graphify path "enumerateCyclesDual()" "evaluatePathsParallel()"
run graphify path "evaluatePathsParallel()" "computeProfit()"
run graphify path "scoreRoute()" "buildArbTx()"
run graphify path "computeProfit()" "buildArbTx()"
run graphify path "recommendGasParams()" "sendTx()"
run graphify path "RouteCache" "evaluatePathsParallel()"
run graphify path "routeKeyFromEdges()" "computeRouteHash()"
run graphify path "executeWithRpcRetry()" "fetchGasPrice()"

# Explanations for the chokepoints identified by the current graph report.
run graphify explain "RegistryService"
run graphify explain "StateWatcher"
run graphify explain "RoutingGraph"
run graphify explain "RouteCache"
run graphify explain "WorkerPool"
run graphify explain "enumerateCyclesDual()"
run graphify explain "evaluatePathsParallel()"
run graphify explain "scoreRoute()"
run graphify explain "computeProfit()"
run graphify explain "buildArbTx()"
run graphify explain "recommendGasParams()"
run graphify explain "sendTx()"
run graphify explain "executeWithRpcRetry()"
