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

# Top 10 likely bugs / misconfigurations.
run graphify query "Analyze the full codebase and rank the top 10 most likely real bugs, behavioral regressions, invariant violations, or production misconfigurations. Prioritize issues that can cause wrong trades, stale state, false profitability, broken startup or recovery, watcher drift, nonce or gas problems, cache misuse, or silent operator confusion. For each candidate, name the most likely file/function owners and why the failure mode is credible."

run graphify query "Focus on mismatches between simulation and execution across routing, profit, state, gas, nonce, and watcher layers. Rank the top 10 places where the code can appear correct structurally but still behave incorrectly at runtime because of stale inputs, account-specific state, unit mismatches, ordering assumptions, optimistic caches, or fallback behavior."

run graphify query "Rank the top 10 most credible misconfigurations or unsafe defaults across config, startup, RPC, metrics, TUI, discovery cadence, warmup budgets, heartbeat timing, gas policy, private-key live mode, and watcher lookback or checkpoint handling. Distinguish code bugs from operator or environment misconfiguration, but rank both by production risk."

run graphify query "Find the top 10 places where errors are likely to be silently swallowed, downgraded, quarantined without enough visibility, or converted into fallback behavior that can mask correctness bugs. Focus on warmup, watcher updates, route filtering, fast revalidation, execution preparation, bundle fallback, and discovery."

run graphify query "Which 10 call-graph seams most deserve a manual bug review because they bridge multiple trust boundaries such as db to cache, watcher to simulation, route result to tx build, fee snapshot to execution, or discovery to topology rebuild? Rank them by likelihood of causing real incorrect behavior."

# Top 10 improvements.
run graphify query "Analyze the full codebase and rank the top 10 highest-leverage improvements you would make next. Prioritize improvements that materially increase correctness, maintainability, testability, observability, startup safety, or runtime performance. For each improvement, name the likely owner files/functions and explain the leverage."

run graphify query "Rank the top 10 engineering improvements that would reduce bug surface the most, even if they are not direct bug fixes. Focus on stronger module boundaries, removing duplicated policy, extracting pure logic, improving cache ownership, reducing orchestration complexity in runner.ts, and clarifying state-transition ownership."

run graphify query "Which 10 improvements would most improve operational reliability in production? Focus on startup sequencing, discovery and warmup flow, watcher rollback handling, route freshness, metrics and logs coverage, RPC resilience, config validation, and execution safeguards."

run graphify query "Which 10 test improvements or verification layers would buy the most confidence per unit effort? Focus on cross-module invariants, simulation versus execution assumptions, watcher state transitions, discovery/topology rebuilds, route freshness and quarantine, gas recommendation, and startup or shutdown lifecycle."

run graphify query "If you had to propose a ranked top 10 roadmap from this codebase state, what would it be? Separate immediate bug-risk reductions from medium-term architecture or performance improvements, but keep one combined ordered list by total expected leverage."

# Directed bug-risk paths.
run graphify path "StateWatcher" "simulateRoute()"
run graphify path "revalidateCachedRoutes" "executeBatchIfIdle"
run graphify path "findArbs()" "sendTx()"
run graphify path "discoverPools()" "refreshCycles()"
run graphify path "warmupStateCache()" "refreshCycles()"
run graphify path "PriceOracle" "buildArbTx()"
run graphify path "recommendGasParams()" "sendTx()"
run graphify path "NonceManager" "sendTx()"
run graphify path "route_cache.ts" "revalidateCachedRoutes"
run graphify path "watcher_state_ops.ts" "simulateHop()"

# Chokepoint explanations for ranking.
run graphify explain "runner.ts"
run graphify explain "findArbs()"
run graphify explain "revalidateCachedRoutes"
run graphify explain "prepareExecutionCandidate"
run graphify explain "sendTx()"
run graphify explain "StateWatcher"
run graphify explain "warmupStateCache()"
run graphify explain "discoverPools()"
run graphify explain "PriceOracle"
run graphify explain "RegistryService"
