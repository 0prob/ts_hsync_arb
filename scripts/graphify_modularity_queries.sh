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

# Architectural ownership and oversized modules.
run graphify query "Map the current module boundaries across runner.ts, discovery, db, routing, state, profit, execution, tui, util, and protocols. Identify which files act as orchestration hubs, which files are mostly pure helpers, and which files are overloaded because they mix scheduling, I/O, state mutation, math, formatting, caching, and policy decisions."

run graphify query "Find the highest-leverage refactor seams to improve modularity. Prioritize files or functions that are too central, too large, or bridge too many unrelated concerns. Focus on runner.ts, StateWatcher, RegistryService, RouteCache, WorkerPool, warmupStateCache, findArbs, revalidateCachedRoutes, prepareExecutionCandidate, executeBatchIfIdle, and the routing graph builders."

run graphify query "Which parts of runner.ts should move into separate components or services? Distinguish bootstrap, discovery cadence, warmup/state seeding, route search, route revalidation, execution preparation, execution dispatch, adaptive scheduling, observability, and shutdown lifecycle. Suggest natural component boundaries and the data each boundary should own."

# Consolidation and duplicate responsibility.
run graphify query "Find duplicated or near-duplicated responsibilities across the codebase, including parsing helpers, pool token and metadata accessors, state cache merge/reload logic, protocol fetch-and-normalize flows, route serialization/hydration helpers, profit assessment wrappers, and logging/formatting utilities. Highlight code that should be consolidated into one owner."

run graphify query "Inspect whether multiple modules provide overlapping abstractions for pool records, state records, route identity, path formatting, freshness tracking, cache invalidation, or protocol metadata. Focus on util/pool_record.ts, state/pool_record.ts, state/cache_utils.ts, watcher_state_ops.ts, routing/route_cache.ts, and any helper functions in runner.ts that duplicate lower-level modules."

run graphify query "Which wrappers or adapters are thin enough to remove or inline, and which repeated inline patterns should instead become reusable components? Distinguish valuable abstraction from pass-through indirection across routing, execution, state, discovery, and utility modules."

# Removal, simplification, and dead-weight.
run graphify query "Find functions, files, or abstractions that appear underused, single-call-site only, stale after earlier refactors, or structurally isolated in the graph. Prioritize candidates for deletion, merger, or simplification, especially where a dedicated module exists for a tiny amount of behavior."

run graphify query "Which functions in runner.ts are pure utility or formatting helpers that should be extracted into smaller modules, and which helpers are so local that they should instead be folded into their only call sites? Focus on formatting, candidate comparison, route freshness/quarantine, probe amount selection, serialized topology caching, and adaptive scheduling helpers."

run graphify query "Audit protocol-specific code for opportunities to share a common interface or remove unnecessary divergence. Compare the fetch, normalize, validate, enrich, and watcher-refresh flows for V2, V3, Curve, and Balancer. Identify code that should live behind a protocol adapter boundary versus code that should remain protocol-specific."

# Boundary quality and dependency direction.
run graphify query "Trace dependency direction across db, discovery, state, routing, profit, execution, util, and tui. Identify upward leaks where low-level modules know too much about orchestration policy, and downward leaks where runner.ts reimplements logic that should be owned by lower-level modules."

run graphify query "Which components should own caches and freshness logic? Compare stateCache, RouteCache, gas estimate caching, serialized topology caching, watcher checkpoint state, oracle freshness, and execution quarantine. Identify caches that should be grouped into dedicated components or policy objects rather than scattered across runner.ts and feature modules."

run graphify query "Find seams where pure computation can be separated more cleanly from side effects. Focus on computeProfit, route assessment, gas recommendation, state normalization, watcher state transitions, discovery result handling, and execution preparation. Identify where moving logic into pure units would reduce coupling and simplify testing."

run graphify query "Locate modules with mixed read-model and write-model responsibilities, especially around registry access, cache mutation, watcher commits, discovery persistence, and execution submission tracking. Suggest where command/query separation or dedicated repositories/services would make the design simpler."

# Component extraction candidates.
run graphify query "If this codebase were reorganized into clearer components, what should exist? Propose candidate modules such as route_assessment_service, execution_coordinator, discovery_coordinator, warmup_service, state_freshness_manager, protocol_adapter registry, or operator_observability. Base the recommendation on actual coupling and call-graph bridges, not generic layering advice."

run graphify query "Which state-transition code belongs inside StateWatcher versus helper modules like watcher_state_ops, cache_utils, and normalizer? Identify logic that should move out of the watcher class, and logic that should move into a dedicated transactional state-update component."

run graphify query "Which execution-path responsibilities belong inside sendTx/buildArbTx versus a higher-level execution coordinator? Focus on transaction building, dry-run policy, nonce coordination, submission policy, bundle fallback, failure classification, and route quarantine side effects."

# Directed path tracing for bridge nodes.
run graphify path "runner.ts" "StateWatcher"
run graphify path "runner.ts" "RouteCache"
run graphify path "runner.ts" "RegistryService"
run graphify path "runner.ts" "computeProfit()"
run graphify path "runner.ts" "buildArbTx()"
run graphify path "runner.ts" "sendTx()"
run graphify path "discoverPools()" "RegistryService"
run graphify path "StateWatcher" "commitWatcherState"
run graphify path "StateWatcher" "reloadWatcherCache"
run graphify path "normalizePoolState()" "simulateHop()"
run graphify path "computeProfit()" "prepareExecutionCandidate"
run graphify path "prepareExecutionCandidate" "sendTx()"
run graphify path "RouteCache" "revalidateCachedRoutes"
run graphify path "state/cache_utils.ts" "StateWatcher"
run graphify path "util/pool_record.ts" "state/pool_record.ts"

# Chokepoint explanations.
run graphify explain "runner.ts"
run graphify explain "StateWatcher"
run graphify explain "RegistryService"
run graphify explain "RouteCache"
run graphify explain "discoverPools()"
run graphify explain "warmupStateCache()"
run graphify explain "findArbs()"
run graphify explain "revalidateCachedRoutes()"
run graphify explain "prepareExecutionCandidate"
run graphify explain "executeBatchIfIdle"
run graphify explain "watcher_state_ops.ts"
run graphify explain "cache_utils.ts"
run graphify explain "util/pool_record.ts"
run graphify explain "state/pool_record.ts"
