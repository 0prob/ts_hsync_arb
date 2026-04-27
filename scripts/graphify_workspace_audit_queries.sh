#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_DIR="$ROOT_DIR/graphify-out/workspace-audit-runs/$RUN_ID"
STATUS_FILE="$OUT_DIR/STATUS.md"
COMMANDS_FILE="$OUT_DIR/commands.tsv"
FAILED=0

cd "$ROOT_DIR"
mkdir -p "$OUT_DIR"

{
  printf '# Workspace Graphify Audit Run\n\n'
  printf -- '- Run ID: `%s`\n' "$RUN_ID"
  printf -- '- Root: `%s`\n' "$ROOT_DIR"
  printf -- '- Scope: correctness, production safety, optimization, and verification gaps\n\n'
} > "$STATUS_FILE"
printf 'kind\tstatus\toutput\tcommand\n' > "$COMMANDS_FILE"

slugify() {
  printf '%s' "$1" \
    | tr '[:upper:]' '[:lower:]' \
    | sed -E 's/[^a-z0-9]+/_/g; s/^_+//; s/_+$//; s/_+/_/g' \
    | cut -c1-80
}

record() {
  local kind="$1"
  local label="$2"
  local command="$3"
  local slug output status

  slug="$(slugify "$label")"
  output="$OUT_DIR/${kind}_${slug}.md"

  printf '\n==> [%s] %s\n' "$kind" "$label"
  printf '```bash\n%s\n```\n\n' "$command" > "$output"
  set +e
  bash -lc "$command" 2>&1 | tee -a "$output"
  status="${PIPESTATUS[0]}"
  set -e

  printf '%s\t%s\t%s\t%s\n' "$kind" "$status" "${output#$ROOT_DIR/}" "$command" >> "$COMMANDS_FILE"
  if [[ "$status" -eq 0 ]]; then
    printf -- '- PASS `%s`: [%s](%s)\n' "$kind" "$label" "${output#$ROOT_DIR/}" >> "$STATUS_FILE"
  else
    printf -- '- FAIL `%s`: [%s](%s) status=%s\n' "$kind" "$label" "${output#$ROOT_DIR/}" "$status" >> "$STATUS_FILE"
    FAILED=1
  fi
  return 0
}

query() {
  local label="$1"
  local question="$2"
  record "query" "$label" "graphify query $(printf '%q' "$question")"
}

path_query() {
  local from="$1"
  local to="$2"
  record "path" "$from to $to" "graphify path $(printf '%q' "$from") $(printf '%q' "$to")"
}

explain() {
  local node="$1"
  record "explain" "$node" "graphify explain $(printf '%q' "$node")"
}

record "update" "refresh root graph" "graphify update ."

query "cross community bridge risk" \
  "Use the current graph report to rank the top 12 correctness risks at cross-community bridges. Focus on RegistryService, get(), StateWatcher, normalizeEvmAddress(), normalizeProtocolKey(), log(), RpcManager, WorkerPool, recommendGasParams(), discoverProtocol(), RouteCache, and NonceManager. For each risk, name owner files/functions and the concrete invariant that should be checked in source."

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

explain "RegistryService"
explain "StateWatcher"
explain "RouteCache"
explain "RpcManager"
explain "computeProfit()"
explain "scoreRoute()"
explain "recommendGasParams()"
explain "buildArbTx()"
explain "sendTx()"
explain "WorkerPool"

{
  printf '\n## Summary\n\n'
  printf -- '- Outputs: `%s`\n' "${OUT_DIR#$ROOT_DIR/}"
  printf -- '- Commands: `%s`\n' "${COMMANDS_FILE#$ROOT_DIR/}"
} >> "$STATUS_FILE"

printf '\nAudit outputs written to %s\n' "${OUT_DIR#$ROOT_DIR/}"
exit "$FAILED"
