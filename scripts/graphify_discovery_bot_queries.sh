#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FOCUS_PATH="${1:-.}"
UPDATE_PATH="."
QUERY_BUDGET="${GRAPHIFY_QUERY_BUDGET:-3000}"
BASE_RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)"
RUN_ID="$BASE_RUN_ID"
RUN_DIR="$ROOT_DIR/graphify-out/discovery-bot-runs/$RUN_ID"
if [[ -e "$RUN_DIR" ]]; then
  suffix=1
  while [[ -e "$ROOT_DIR/graphify-out/discovery-bot-runs/${BASE_RUN_ID}-${suffix}" ]]; do
    suffix=$((suffix + 1))
  done
  RUN_ID="${BASE_RUN_ID}-${suffix}"
  RUN_DIR="$ROOT_DIR/graphify-out/discovery-bot-runs/$RUN_ID"
fi
LOG_FILE="$RUN_DIR/OUTPUT.md"
SCOPE_FILE="$RUN_DIR/SCOPE.md"
COMMANDS_FILE="$RUN_DIR/commands.tsv"
STATUS_FILE="$RUN_DIR/STATUS.md"

cd "$ROOT_DIR"
mkdir -p "$RUN_DIR"
START_EPOCH="$(date +%s)"
STARTED_UTC="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

finish() {
  local exit_code="$1"
  local finished_epoch
  finished_epoch="$(date +%s)"
  {
    echo "# Run Status"
    echo
    echo "- run_id: $RUN_ID"
    echo "- exit_code: $exit_code"
    echo "- started_utc: $STARTED_UTC"
    echo "- finished_utc: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "- duration_seconds: $((finished_epoch - START_EPOCH))"
    echo "- focus_path: $FOCUS_PATH"
    echo "- update_path: $UPDATE_PATH"
    echo "- query_budget: $QUERY_BUDGET"
    echo "- output: $LOG_FILE"
    echo "- commands: $COMMANDS_FILE"
  } > "$STATUS_FILE"
}
trap 'finish $?' EXIT

cat > "$SCOPE_FILE" <<'SCOPE'
# Discovery Repair And Bot Optimization Scope

This query suite is intended to diagnose and repair discovery first, then optimize the bot only after the discovered pool universe, metadata, live state, and routing graph are trustworthy.

Primary audit rules:

- Treat discovery as a coverage and correctness problem before treating it as a throughput problem.
- Verify every protocol and factory path independently: V2, V3, Balancer, Curve stable, Curve crypto, listed factories, removals, metadata enrichment, and rediscovery.
- Follow discovered pools through registry persistence, state warmup/hydration, topology admission, route enumeration, simulation, profitability assessment, and execution.
- Rank optimizations by impact on executable profitable opportunities, not by local microbenchmarks alone.
- Prefer changes that improve correctness, observability, and restart/reorg safety before increasing concurrency or scan rate.
SCOPE

run() {
  local cmd=("$@")
  {
    printf '\n==>'
    for arg in "${cmd[@]}"; do
      printf ' %q' "$arg"
    done
    printf '\n'
  } | tee -a "$LOG_FILE"
  {
    printf '%s\t' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    printf '%q ' "${cmd[@]}"
    printf '\n'
  } >> "$COMMANDS_FILE"
  "${cmd[@]}" 2>&1 | tee -a "$LOG_FILE"
}

query() {
  run graphify query "$1" --budget "$QUERY_BUDGET"
}

path_query() {
  run graphify path "$1" "$2" || true
}

explain() {
  run graphify explain "$1" || true
}

{
  echo "# Discovery Repair And Bot Optimization Graphify Run"
  echo
  echo "- run_id: $RUN_ID"
  echo "- focus_path: $FOCUS_PATH"
  echo "- update_path: $UPDATE_PATH"
  echo "- query_budget: $QUERY_BUDGET"
  echo "- scope: $SCOPE_FILE"
} > "$LOG_FILE"
printf 'timestamp_utc\tcommand\n' > "$COMMANDS_FILE"

run graphify update "$UPDATE_PATH"

# 1. Discovery inventory and ownership.
query "Inventory the entire discovery system across runner startup, background discovery, src/discovery/discover.ts, protocol catalogs, factory enumerators, HyperSync query construction, metadata enrichment, registry writes, checkpointing, rollback guards, removals, hydration, and topology refresh. Classify each owner by responsibility and identify duplicated or unclear ownership."

query "Trace every path that can add, update, reactivate, disable, or remove a pool. Include initial discovery, background discovery, listed-factory discovery, Curve removals, reorg rollback, quiet-pool sweep, discovery hydration, registry batch upserts, topology admission, and route cache invalidation. Identify state transitions that are not explicit or observable enough."

query "Map the source-of-truth chain for discovered pools: factory events, listed factory calls, contract catalog, pool metadata, registry rows, state cache entries, topology edges, route cache entries, and TUI/operator views. Identify where the same concept is represented differently or can drift."

# 2. Protocol and factory coverage.
query "Audit discovery coverage protocol by protocol: Uniswap V2, Uniswap V3, Balancer, Curve stable, Curve crypto, legacy Curve factories, listed Curve factories, and pool removals. For each protocol, list factory sources, event signatures, block start logic, metadata extraction, token enrichment, state hydration, and likely under-coverage risks."

query "Trace factory and contract catalog usage across src/protocols, discovery, registry metadata, and tests. Identify stale addresses, missing factory variants, wrong protocol labels, duplicate catalog entries, chain-specific assumptions, and places where a new factory would need edits in multiple files."

query "Audit Curve discovery specifically. Follow stable and crypto factories, listed-factory enumeration, get_coins/getPoolCount-style calls, removals, metadataFactoryIndex, protocol normalization, and state support. Identify why Curve coverage can lag other protocols and what repair should be prioritized."

query "Audit Balancer discovery and state readiness. Trace pool discovery, poolId handling, token list enrichment, state normalization, liquidity validation, topology admission, and execution support. Identify coverage gaps and places where a discovered Balancer pool never becomes routeable."

query "Audit V2 and V3 discovery for correctness and completeness. Include factory event signatures, topic filters, fee metadata, token order, tick spacing, start block defaults, checkpoints, token metadata hydration, and warmup handoff. Identify conditions where pools are discovered but unusable or missing from routing."

# 3. Checkpoints, pagination, and restart safety.
query "Trace discovery checkpoint math end to end: discoverStartIndex, buildDiscoveryScanQuery, fetchAllLogsWithClient, discoveryCheckpointFromNextBlock, protocol checkpoints, global checkpoints, rollback guard persistence, and restart behavior. Identify off-by-one, exclusive toBlock, partial failure, and moving-tip risks."

query "Audit background discovery scheduling and reconciliation. Follow pass runner scheduling, discovery intervals, reconcileDiscoveryResult, trackBackgroundTask, error backoff, startup discovery, quiet-pool sweep, and hydration retry. Identify races, duplicate work, starvation, and places where discovery failure silently degrades routing."

query "Find every path where discovery can make progress in memory but fail to persist durable state, or persist registry changes without refreshing in-memory caches and topology. Rank partial-commit and stale-cache risks by production impact."

query "Audit reorg and rollback interactions with discovery. Follow rollbackToBlock, removed_block semantics, rollbackWatcherState, discovery checkpoints, pool status transitions, state history, topology reload, and route invalidation. Identify whether discovered pools and removed pools recover correctly after chain reorgs."

# 4. Metadata, state hydration, and routeability.
query "Trace metadata hydration from discovery output through registry upsert, token metadata, pool_record parsing, state warmup, quiet-pool hydration, discovery hydration, normalizer, and route graph construction. Identify missing decimals, malformed token lists, fee defaults, unsupported protocol states, and hidden JSON parse risks."

query "For every discovered pool class, determine the path to becoming routeable. Include token metadata, valid pool state, topology edges, supported simulation, route enumeration, price oracle support, and execution encoding. Identify discovered pools that are likely dead-on-arrival and why."

query "Audit how invalid or incomplete discovered pools are surfaced. Follow debugInvalidPool, warmup skip reasons, topology removals, discovery hydration logs, registry status, TUI summaries, and metrics. Identify where operators cannot tell whether discovery is incomplete, unsupported, stale, or simply waiting for hydration."

query "Analyze state-cache seeding for new discoveries. Verify placeholder state shape, timestamp handling, token/protocol metadata, later watcher updates, warmup persistence, and invalid-state classification. Identify whether newly discovered pools can poison routing, hide opportunities, or loop hydration forever."

# 5. Topology and routing handoff.
query "Trace the handoff from discovery to topology and route enumeration: registry writes, seedNewPoolsIntoStateCache, buildGraph, buildHubGraph, topology cache, refreshCycles, enumerateCyclesDual, route cache update, and worker evaluation. Identify stale or missing invalidation that can leave new pools unused."

query "Audit route graph completeness after discovery. Identify whether all supported discovered pools get bidirectional edges when appropriate, whether protocol support filters are correct, whether token metadata gates are too strict or too loose, and whether topology refresh cadence misses new opportunities."

query "Find where discovery and routing disagree about protocol identity, token ordering, pool address normalization, fee representation, poolId, and route support. Rank mismatches that can cause missed routes, wrong simulation, or wrong execution calldata."

query "Trace newly discovered pools through route cache freshness and revalidation. Identify whether route cache entries are invalidated, refreshed, or admitted when discovery adds/removes pools, when watcher updates state, and when rollback removes state."

# 6. Profitability pipeline after discovery is repaired.
query "Trace the full opportunity pipeline after discovery repair: findArbs, route enumeration, candidate selection, price oracle, gas estimate cache, optimizeInputAmount, simulateRoute, assessRouteResult, revalidation, buildArbTx, and sendTx. Identify where better discovery increases load and which downstream gates will become the next bottleneck."

query "Audit false negatives in the profitability pipeline. Focus on discovered pools that are routeable but discarded by pruneByLiquidity, edgeSpotLogWeight, candidate limits, stale pricing, gas assumptions, optimization budget, route cache freshness, or unsupported execution metadata."

query "Audit false positives after broadening discovery. Identify how low-liquidity pools, stale states, unsupported protocols, bad token metadata, route cycles with poor price oracle coverage, and simulation approximations can waste CPU or create unsafe execution candidates."

query "Rank the highest-leverage profitability improvements that depend on discovery being correct. Include candidate shortlist policy, second-chance optimization, stale-price rejection, gas-denominated profit checks, triangular paths, worker chunking, and execution revalidation."

# 7. Bot runtime optimization.
query "Trace the main bot pass lifecycle across startup, initial discovery, warmup, refreshCycles, runPass, background discovery, quiet-pool sweep, stale oracle refresh, opportunity search, execution dispatch, heartbeat, metrics, TUI updates, and shutdown. Identify serial bottlenecks and unnecessary repeated work."

query "Identify CPU hotspots that will grow with better discovery coverage. Focus on graph building, route enumeration, path dedupe, worker serialization, simulation math, optimization loops, route revalidation, price lookups, and route cache maintenance. Rank by likely impact and ease of repair."

query "Identify IO and RPC hotspots that will grow with better discovery coverage. Focus on registry reads/writes, token metadata hydration, pool state warmup, HyperRPC multicalls, gas and fee reads, private tx submission, receipt polling, and metrics/log output."

query "Audit concurrency and backpressure across discovery, warmup, quiet-pool sweep, worker pool evaluation, RPC manager, pass runner, and execution. Identify where increasing concurrency would improve throughput and where it would create stale state, rate-limit, or CPU contention problems."

query "Analyze cache ownership and invalidation for bot optimization: stateCache, RouteCache, topology cache, gas estimate cache, registry meta cache, token metadata, worker serialized state, and candidate/revalidation caches. Identify caches that should become versioned, write-through, or explicitly scoped to a pass."

query "Find logging and metrics changes needed before optimizing the bot. Identify which discovery, hydration, topology, route evaluation, profitability, execution, and backoff counters/timers would make optimization measurable and prevent regressions."

# 8. Tests, benchmarks, and live verification.
query "List existing tests that protect discovery, metadata, checkpointing, reorg rollback, watcher state, route enumeration, profitability, execution hot path, and runtime orchestration. For each, explain what it proves and what important behavior remains untested."

query "Design the ideal test matrix for repairing discovery before optimizing the bot. Include protocol-specific discovery fixtures, checkpoint edge cases, listed-factory coverage, removed pools, metadata parsing, hydration retry, topology admission, routeability, and reorg recovery."

query "Design the ideal benchmark and profiling plan after discovery repair. Include graph size, pool count, route count, pass latency, worker CPU, serialization volume, registry query counts, RPC request counts, opportunity throughput, and execution decision latency."

query "Design a live verification checklist for Polygon discovery repair: clean env validation, current height capture, bounded protocol discovery, Curve listed-factory spot checks, registry pool-count deltas, hydration success, topology edge deltas, route count deltas, and profitable-opportunity dry run."

# 9. Repair and optimization roadmap.
query "Rank the top 20 concrete discovery bug risks. Prioritize under-coverage, stale factory sources, checkpoint mistakes, missed removals, metadata corruption, hydration dead ends, stale topology, restart drift, and reorg gaps. For each, name owner files, expected symptom, repair approach, and verification."

query "Rank the top 20 bot optimization opportunities that should come after discovery repair. Prioritize changes by executable-profit impact, runtime safety, observability, and implementation cost. Separate correctness optimizations from pure throughput optimizations."

query "Produce an ordered implementation roadmap: phase 1 discovery correctness, phase 2 discovery observability and live verification, phase 3 routeability and topology fixes, phase 4 profitability throughput, phase 5 runtime and execution optimization. Include owner files and validation commands for each phase."

query "If only one week of work is available, what is the highest-return sequence to repair discovery and optimize the bot? Use the graph to justify the ordering and explicitly call out dependencies that must not be skipped."

# 10. Directed path queries for discovery-to-execution seams.
path_query "discoverPools()" "RegistryService"
path_query "discoverProtocol()" "buildDiscoveryScanQuery()"
path_query "buildDiscoveryScanQuery()" "fetchAllLogsWithClient()"
path_query "discoverCurveListedFactory()" "batchUpsertPools()"
path_query "discoverCurveRemovals()" "rollbackToBlock()"
path_query "batchUpsertPools()" "seedNewPoolsIntoStateCache()"
path_query "seedNewPoolsIntoStateCache()" "buildGraph()"
path_query "buildGraph()" "enumerateCyclesDual()"
path_query "discoverPools()" "refreshCycles()"
path_query "refreshCycles()" "evaluatePathsParallel()"
path_query "evaluatePathsParallel()" "assessRouteResult()"
path_query "assessRouteResult()" "buildArbTx()"
path_query "createExecutionCoordinator()" "buildArbTx()"
path_query "buildArbTx()" "sendTx()"
path_query "StateWatcher" "RouteCache"
path_query "rollbackToBlock()" "refreshCycles()"
path_query "PriceOracle" "assessRouteResult()"
path_query "WorkerPool" "simulateRoute()"
path_query "runPass" "discoverPools()"
path_query "runPass()" "sendTx()"

# 11. Chokepoint explanations.
explain "discoverPools()"
explain "discoverPoolsWithDeps()"
explain "discoverProtocol()"
explain "buildDiscoveryScanQuery()"
explain "discoverCurveListedFactory()"
explain "discoverCurveRemovals()"
explain "RegistryService"
explain "seedNewPoolsIntoStateCache()"
explain "refreshCycles()"
explain "buildGraph()"
explain "enumerateCyclesDual()"
explain "evaluatePathsParallel()"
explain "RouteCache"
explain "PriceOracle"
explain "assessRouteResult()"
explain "createExecutionCoordinator()"
explain "WorkerPool"
explain "runPass"
explain "opportunity_engine.ts"
explain "sendTx()"

{
  echo
  echo "Run complete."
  echo "- Output: $LOG_FILE"
  echo "- Scope: $SCOPE_FILE"
  echo "- Commands: $COMMANDS_FILE"
  echo "- Status: $STATUS_FILE"
} | tee -a "$LOG_FILE"
