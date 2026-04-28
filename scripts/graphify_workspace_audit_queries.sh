#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)"
RUN_ID="$BASE_RUN_ID"
OUT_DIR="$ROOT_DIR/graphify-out/workspace-audit-runs/$RUN_ID"
STATUS_FILE="$OUT_DIR/STATUS.md"
COMMANDS_FILE="$OUT_DIR/commands.tsv"
SCOPE_FILE="$OUT_DIR/SCOPE.md"
QUERY_BUDGET="${GRAPHIFY_QUERY_BUDGET:-3500}"
FAILED=0

cd "$ROOT_DIR"
if [[ -e "$OUT_DIR" ]]; then
  suffix=1
  while [[ -e "$ROOT_DIR/graphify-out/workspace-audit-runs/${BASE_RUN_ID}-${suffix}" ]]; do
    suffix=$((suffix + 1))
  done
  RUN_ID="${BASE_RUN_ID}-${suffix}"
  OUT_DIR="$ROOT_DIR/graphify-out/workspace-audit-runs/$RUN_ID"
  STATUS_FILE="$OUT_DIR/STATUS.md"
  COMMANDS_FILE="$OUT_DIR/commands.tsv"
  SCOPE_FILE="$OUT_DIR/SCOPE.md"
fi
mkdir -p "$OUT_DIR"

{
  printf '# Workspace Graphify Audit Run\n\n'
  printf -- '- Run ID: `%s`\n' "$RUN_ID"
  printf -- '- Root: `%s`\n' "$ROOT_DIR"
  printf -- '- Scope: correctness, production safety, optimization, and verification gaps\n\n'
  printf -- '- Query budget: `%s`\n' "$QUERY_BUDGET"
  printf -- '- Scope notes: [%s](%s)\n\n' "SCOPE.md" "SCOPE.md"
} > "$STATUS_FILE"
printf 'kind\tstatus\toutput\tcommand\n' > "$COMMANDS_FILE"

cat > "$SCOPE_FILE" <<'SCOPE'
# Workspace Audit Pack Scope

This pack is intended to find high-impact graph-guided issues in the arbitrage
bot, not to produce a static architecture report. It should stay aligned with:

- End-to-end profitable execution: discovery, state, routing, simulation,
  assessment, revalidation, transaction build, and submission.
- Restart and operator safety: startup, warmup, metrics, TUI/log ownership,
  shutdown, and persistent caches.
- Runtime correctness under chain/RPC stress: HyperSync pagination, rollback,
  watcher shard merge, RPC retries, endpoint selection, gas policy, and DB
  cache consistency.
- Performance without correctness loss: topology refresh, cycle enumeration,
  worker IPC, route-cache persistence, and repeated RPC/log work.
- Audit-pack quality: questions should mention concrete owner files/functions,
  expected invariants, and verification commands.
SCOPE

slugify() {
  printf '%s' "$1" \
    | tr '[:upper:]' '[:lower:]' \
    | sed -E 's/[^a-z0-9]+/_/g; s/^_+//; s/_+$//; s/_+/_/g' \
    | cut -c1-80
}

quote_command() {
  local quoted=()
  local arg
  for arg in "$@"; do
    quoted+=("$(printf '%q' "$arg")")
  done
  printf '%s' "${quoted[*]}"
}

record() {
  local kind="$1"
  local label="$2"
  local fatal="$3"
  shift 3
  local slug output status command_display status_label link_target

  slug="$(slugify "$label")"
  output="$OUT_DIR/${kind}_${slug}.md"
  command_display="$(quote_command "$@")"
  link_target="$(basename "$output")"

  printf '\n==> [%s] %s\n' "$kind" "$label"
  printf '```bash\n%s\n```\n\n' "$command_display" > "$output"
  set +e
  "$@" 2>&1 | tee -a "$output"
  status="${PIPESTATUS[0]}"
  set -e

  printf '%s\t%s\t%s\t%s\n' "$kind" "$status" "${output#$ROOT_DIR/}" "$command_display" >> "$COMMANDS_FILE"
  if [[ "$status" -eq 0 ]]; then
    printf -- '- PASS `%s`: [%s](%s)\n' "$kind" "$label" "$link_target" >> "$STATUS_FILE"
  elif [[ "$fatal" == "optional" ]]; then
    status_label="WARN"
    printf -- '- %s `%s`: [%s](%s) status=%s\n' "$status_label" "$kind" "$label" "$link_target" "$status" >> "$STATUS_FILE"
  else
    printf -- '- FAIL `%s`: [%s](%s) status=%s\n' "$kind" "$label" "$link_target" "$status" >> "$STATUS_FILE"
    FAILED=1
  fi
  return 0
}

query() {
  local label="$1"
  local question="$2"
  record "query" "$label" "fatal" graphify query "$question" --budget "$QUERY_BUDGET"
}

path_query() {
  local from="$1"
  local to="$2"
  record "path" "$from to $to" "optional" graphify path "$from" "$to"
}

explain() {
  local node="$1"
  record "explain" "$node" "optional" graphify explain "$node"
}

record "update" "refresh root graph" "fatal" graphify update .

query "cross community bridge risk" \
  "Use the current graph report to rank the top 12 correctness risks at cross-community bridges. Focus on RegistryService, get(), StateWatcher, normalizeEvmAddress(), normalizeProtocolKey(), log(), RpcManager, WorkerPool, recommendGasParams(), discoverProtocol(), RouteCache, NonceManager, index.ts config, and startMetricsServer. For each risk, name owner files/functions, the concrete invariant that should be checked in source, and the cheapest verification command."

query "profitable trade correctness" \
  "Audit the end-to-end profitable trade path from discovery and state normalization through route search, simulation, scoring, computeProfit, revalidation, gas policy, transaction building, private/public submission, and receipt handling. Identify credible places where a route could be ranked profitable but be stale, unit-mismatched, unexecutable, or unsafe."

query "state freshness and rollback correctness" \
  "Trace state freshness across discoverPools, warmupStateCache, reloadCacheFromRegistry, StateWatcher, watcher_state_ops, rollbackToBlock, RouteCache, getPathFreshness, and simulateHop. Rank concrete stale-state, mixed-time-state, reorg, checkpoint, and cache-divergence failure modes."

query "discovery coverage and topology admission" \
  "Audit discovery coverage and topology admission from HyperSync scans through RegistryService upserts, token metadata hydration, state cache seeding, refreshCycles, buildGraph, buildHubGraph, and path enumeration. Identify correctness gaps that can hide pools, admit bad pools, or miss executable cycles."

query "gas math and token unit parity" \
  "Inspect gas and token-unit parity across scoreRoute, estimateGasCostWei, computeProfit, gasCostInTokenUnits, PriceOracle tokenToMaticRate flows, recommendGasParams, buildArbTx, and sendTx. Find any duplicated gas math, denomination assumptions, rounding hazards, or cases where start token decimals can distort profitability."

query "execution and abi safety" \
  "Audit execution ABI and calldata safety across buildArbTx, encodeExecuteArb, buildFlashParams, assertValidRouteForExecution, resolveFlashLoan, gasEstimateCacheKeyForRoute, dryRun, NonceManager, sendTx, sendTxBundle, and private transaction fallbacks. Identify places where simulation can pass but execution can fail because of route identity, approvals, nonce, account, or calldata shape."

query "rpc resilience and endpoint optimization" \
  "Trace RPC resilience and endpoint selection across RpcManager, executeWithRpcRetry, readContractWithRetry, multicallWithRetry, estimateGas, fetchGasPrice, fetchEIP1559Fees, GasOracle, and private tx submission. Identify retry-budget, failover, cooldown, probe, rate-limit, and latency-selection improvements that would reduce incorrect failures or slow paths."

query "database transaction and cache consistency" \
  "Audit SQLite transaction semantics, registry persistence, statement caching, rollback guards, checkpoint writes, pool/token metadata writes, history writes, registry meta cache, stateCache, RouteCache, and topology cache. Rank risks for partial writes, stale reads, duplicate rows, migration drift, and cache ownership confusion."

query "math invariant and precision audit" \
  "Audit math invariants and precision across V2, V3, Curve, Balancer, and DODO simulation paths. Focus on rounding direction, zero/negative liquidity handling, fee units, decimal assumptions, tick math, stable invariant convergence, silent zero returns, and false-negative route pruning."

query "hot path optimization opportunities" \
  "Find the highest-leverage runtime optimization opportunities in discovery, watcher ingestion, registry reads/writes, topology refresh, route enumeration, route evaluation, worker IPC, gas estimation, RPC calls, logging, and TUI rendering. Prioritize changes that reduce latency or wasted work without weakening correctness."

query "startup warmup and hang risks" \
  "Audit startup, warmup, and post-warmup liveness from boot_mode, startup coordinator, createWarmupManager, warmupStateCache, seedStateCache, workerPool.init, startMetricsServer, startTui, heartbeat scheduling, watcher start, and runAfterBootstrap. Identify credible hangs, promise leaks, blocked background tasks, metrics bind hazards, warmup restart loops, and cases where warmup completes but the bot stops making progress."

query "runtime config and package script drift" \
  "Audit runtime configuration and operator scripts across package.json, .env.example, src/config/index.ts, runner.ts, tune_performance.ts, performance cache files, metrics configuration, HyperSync/RPC env vars, live-mode keys, and test entrypoints. Find hard-coded defaults, undocumented env vars, unsafe fallbacks, script drift, and misconfigurations that could make a production run differ from tested behavior."

query "route topology cache and performance persistence" \
  "Audit topology and route-cycle cache behavior across createTopologyService, topology_cache, route cycle cache files, refreshCycles, enumerateCycles, enumerateCyclesDual, selective 4-hop expansion, dynamic pivot token selection, worker pool startup, and graph rebuild invalidation. Identify persistence gaps, stale-cache risks, unnecessary recomputation, and performance knobs that should be bounded or tested."

query "graph confidence and inferred edge validation" \
  "Review the current graph report's high-INFERRED nodes and surprising connections. Prioritize inferred edges around get(), normalizeEvmAddress(), normalizeProtocolKey(), log(), startMetricsServer, RegistryService, StateWatcher, RpcManager, and route topology. Identify which inferred edges are likely false positives, which deserve manual source verification, and which should become concrete Graphify path or explain checks."

query "audit pack coverage and query quality" \
  "Audit scripts/graphify_workspace_audit_queries.sh and the other graphify_* query packs as first-class tooling. Identify stale questions, duplicated coverage, missing risk surfaces, output usability problems, brittle command handling, missing budgets, poor artifact links, and queries that should be split or made more specific. Recommend concrete edits to the pack."

query "observability and operator confusion" \
  "Audit observability across logs, metrics, TUI, startup/shutdown, watcher recovery, discovery progress, route rejection, execution rejection, RPC failover, and persistence errors. Identify where important irreversible decisions or repeated warnings need clearer structured context, metrics, rate limiting, or deduplication."

query "test and verification gaps" \
  "Rank the top 15 missing or weak tests that would most improve confidence in profitable execution. Cover discovery resume, watcher rollback, state normalization, route freshness, gas/token parity, ABI encoding, RPC failover, DB transactions, startup/shutdown, and TUI/log containment. Name likely test files or new scripts."

query "dead code and conflicting ownership" \
  "Find dead, stale, duplicate, redundant, or conflicting code ownership across runner.ts, runtime coordinators, discovery helpers, registry helpers, protocol math, routing, execution, logger/TUI surfaces, and scripts. Separate safe deletion candidates from code that is live but poorly named or under-tested."

query "combined repair roadmap" \
  "Produce one ordered repair roadmap from this graph: immediate correctness fixes first, then production safety hardening, then optimization and cleanup. For each item include owner files, verification command, and whether it should be fixed now or tracked for a larger refactor."

path_query "discoverPools()" "computeProfit()"
path_query "StateWatcher" "simulateHop()"
path_query "rollbackToBlock()" "RouteCache"
path_query "scoreRoute()" "buildArbTx()"
path_query "computeProfit()" "recommendGasParams()"
path_query "RpcManager" "readContractWithRetry()"
path_query "RegistryService" "buildGraph()"
path_query "RouteCache" "sendTx()"
path_query "log()" "startTui()"
path_query "createTopologyService()" "enumerateCyclesDual()"
path_query "startMetricsServer()" "runner.ts"
path_query "createWarmupManager()" "boot_mode.ts"
path_query "boot_mode.ts" "startMetricsServer()"

explain "RegistryService"
explain "StateWatcher"
explain "RouteCache"
explain "RpcManager"
explain "startMetricsServer()"
explain "createWarmupManager()"
explain "createTopologyService()"
explain "computeProfit()"
explain "scoreRoute()"
explain "recommendGasParams()"
explain "buildArbTx()"
explain "sendTx()"
explain "WorkerPool"

{
  printf '\n## Summary\n\n'
  printf -- '- Outputs: `%s`\n' "${OUT_DIR#$ROOT_DIR/}"
  printf -- '- Scope: `%s`\n' "${SCOPE_FILE#$ROOT_DIR/}"
  printf -- '- Commands: `%s`\n' "${COMMANDS_FILE#$ROOT_DIR/}"
} >> "$STATUS_FILE"

printf '\nAudit outputs written to %s\n' "${OUT_DIR#$ROOT_DIR/}"
exit "$FAILED"
