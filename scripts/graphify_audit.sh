#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_PATH="${1:-.}"

cd "$ROOT_DIR"

run() {
  printf '\n==> %s\n' "$*"
  "$@"
}

run graphify update "$TARGET_PATH"
run graphify query "What are the end-to-end execution paths from discoverPools through state normalization, graph building, route enumeration, simulation, profit scoring, and transaction execution?"

run graphify query "Which functions are the highest-risk correctness boundaries between live pool state, route simulation, profit computation, and transaction building?"

run graphify query "Which inferred relationships should be verified first because they affect execution correctness, especially executeWithRpcRetry, refreshCycles, buildArbTx, and fetchEIP1559Fees?"

run graphify query "Where can invalid or stale state enter the system, and which functions are responsible for validation, normalization, cache merge, and route rejection?"

run graphify query "Which modules have low cohesion or act as bridges across many communities, and are likely refactor candidates or hidden sources of coupling?"

run graphify query "Trace how Balancer pool state flows from fetchBalancerPoolState and normalizeBalancerState to simulateBalancerSwap and getBalancerAmountOut, including validation gaps and failure handling."

run graphify query "Trace how Curve and Balancer math functions are reached from routing and identify where malformed state can cause silent rejection versus thrown errors."

run graphify query "Which execution-path functions depend on gas estimation, nonce management, and private transaction sending, and what assumptions connect them?"

run graphify query "Which parts of the routing pipeline are performance hotspots: enumerateCyclesDual, annotatePath, simulateRoute, evaluatePathsParallel, WorkerPool, and route ranking?"

run graphify query "What are the strongest connections around RegistryService, StateWatcher, WorkerPool, RpcManager, and PriceOracle, and where could integrity checks prevent cross-module corruption?"

run graphify path "discoverPools()" "simulateRoute()"
run graphify path "normalizeBalancerState()" "simulateBalancerSwap()"
run graphify path "StateWatcher" "refreshCycles()"
run graphify path "enumerateCyclesDual()" "evaluatePathsParallel()"
run graphify path "computeProfit()" "buildArbTx()"
run graphify path "fetchGasPrice()" "sendTx()"
run graphify path "RegistryService" "RouteCache"

run graphify explain "RegistryService"
run graphify explain "StateWatcher"
run graphify explain "WorkerPool"
run graphify explain "executeWithRpcRetry()"
run graphify explain "refreshCycles()"
run graphify explain "simulateBalancerSwap()"
run graphify explain "getBalancerAmountOut()"
run graphify explain "computeProfit()"
run graphify explain "buildArbTx()"
