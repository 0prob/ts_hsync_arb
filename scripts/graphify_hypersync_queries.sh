#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FOCUS_PATH="${1:-.}"
UPDATE_PATH="."
QUERY_BUDGET="${GRAPHIFY_QUERY_BUDGET:-3000}"
BASE_RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)"
RUN_ID="$BASE_RUN_ID"
RUN_DIR="$ROOT_DIR/graphify-out/hypersync-runs/$RUN_ID"
if [[ -e "$RUN_DIR" ]]; then
  suffix=1
  while [[ -e "$ROOT_DIR/graphify-out/hypersync-runs/${BASE_RUN_ID}-${suffix}" ]]; do
    suffix=$((suffix + 1))
  done
  RUN_ID="${BASE_RUN_ID}-${suffix}"
  RUN_DIR="$ROOT_DIR/graphify-out/hypersync-runs/$RUN_ID"
fi
LOG_FILE="$RUN_DIR/OUTPUT.md"
SOURCES_FILE="$RUN_DIR/OFFICIAL_DOC_SOURCES.md"
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

cat > "$SOURCES_FILE" <<'DOCS'
# Official HyperSync Documentation Basis

Use these official sources when interpreting the graphify results:

- Envio HyperSync complete docs: https://docs.envio.dev/docs/HyperSync-LLM/hypersync-complete
- Installed Node.js client typings: node_modules/@envio-dev/hypersync-client/index.d.ts

Audit criteria distilled from the docs and installed typings:

- Query responses are paginated with nextBlock; every multi-page loop must resume from nextBlock.
- toBlock is exclusive; bounded scans cover [fromBlock, toBlock).
- fieldSelection should request only fields needed by downstream code.
- JoinNothing should be used for log-only paths unless transaction, trace, or block joins are intentionally needed.
- maxNumBlocks and maxNumLogs should bound large requests so server time limits and payload limits do not create repeated failures.
- logs selections are ORed at the selection level; topic positions are ANDed across topic slots and ORed inside each topic slot.
- rollbackGuard is the consistency signal for rollback/reorg detection.
- archiveHeight is the current HyperSync source height and should be handled separately from nextBlock.
- stream/collect can be useful for historical bulk processing, but live-tip paths that need explicit rollback handling should use manual get pagination.
- ENVIO_API_TOKEN is required for hosted HyperSync endpoints.
DOCS

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
  echo "# HyperSync Graphify Run"
  echo
  echo "- run_id: $RUN_ID"
  echo "- focus_path: $FOCUS_PATH"
  echo "- update_path: $UPDATE_PATH"
  echo "- query_budget: $QUERY_BUDGET"
  echo "- official_doc_sources: $SOURCES_FILE"
} > "$LOG_FILE"
printf 'timestamp_utc\tcommand\n' > "$COMMANDS_FILE"

run graphify update "$UPDATE_PATH"

# 1. Complete HyperSync inventory and ownership.
query "Inventory every HyperSync usage and abstraction across src/hypersync, StateWatcher, discovery, reorg detection, runtime startup, config, scripts, and tests. Classify each usage as client setup, query construction, pagination, live polling, discovery scan, rollback handling, decoding, retry/backoff, persistence, metrics, or test coverage. For each class, name owner files and explain whether ownership is centralized or duplicated."

query "Trace all call paths to client.get, client.getHeight, Decoder.fromSignatures, decodeLogs, buildHyperSyncLogQuery, fetchAllLogs, fetchAllLogsWithClient, JoinMode, LogField, BlockField, and rollbackGuard. Identify any direct HyperSync calls that bypass the shared policy or pagination helpers, and rank bypasses by correctness risk."

query "Map every boundary where HyperSync response data becomes durable or business-critical state: discovery pool inserts, watcher state commits, checkpoints, rollback guards, registry state, stateCache, route cache invalidation, price oracle updates, and TUI/operator status. Identify where a malformed response, stale cursor, missed rollback, or bad decoded log can cause lasting damage."

# 2. Official-document compliance audit.
query "Audit HyperSync query construction against official Envio guidance: minimal fieldSelection, explicit maxNumLogs and maxNumBlocks, correct toBlock exclusivity, JoinNothing for log-only requests, precise log filters, and no unnecessary transaction/trace/block joins. Identify every compliant path, every ambiguous path, and every path needing repair."

query "Using the installed @envio-dev/hypersync-client TypeScript typings as source of truth, compare this repo's HyperSync types and query objects against Query, LogFilter, LogSelection, FieldSelection, QueryResponse, RollbackGuard, ClientConfig, StreamConfig, JoinMode, LogField, and BlockField. Find type-shape drift, casing assumptions, missing optional response handling, and fields required by downstream code but not selected."

query "Check whether all HyperSync loops obey official pagination semantics: resume from nextBlock, stop at toBlock or archiveHeight correctly, treat toBlock as exclusive, reject regressed cursors, handle missing archiveHeight, and avoid infinite loops on stalled cursors. Include fetchAllLogsWithClient, discovery, StateWatcher, and any tests that encode cursor behavior."

query "Evaluate whether stream, streamEvents, collect, collectEvents, or getEvents should be used anywhere. Separate historical bulk jobs from live-tip watcher behavior, and explain whether manual client.get loops are justified for rollbackGuard handling in StateWatcher."

# 3. Query shape, payload, and throughput.
query "Audit every HyperSync log filter shape for correctness and payload size: address chunking, topic grouping, OR semantics across log selections, AND semantics across topic positions, empty topic arrays, topic-only fallbacks, and HYPERSYNC_MAX_ADDRESS_FILTER or HYPERSYNC_MAX_FILTERS_PER_REQUEST behavior. Identify filters that can overmatch, undermatch, or exceed request limits."

query "Find every HyperSync request-size, time-limit, or throughput control. Evaluate HYPERSYNC_BATCH_SIZE, HYPERSYNC_MAX_BLOCKS_PER_REQUEST, HYPERSYNC_MAX_ADDRESS_FILTER, HYPERSYNC_MAX_FILTERS_PER_REQUEST, discovery protocol concurrency, watcher shard concurrency, retry delays, and fallback scan intervals. Rank bottlenecks versus correctness safeguards."

query "Trace sparse historical backfills across discovery and fetchAllLogsWithClient. Identify whether maxNumBlocks, maxNumLogs, toBlock snapshots, archiveHeight, maxPages, protocol concurrency, and checkpoint updates prevent scans from chasing a moving tip or timing out indefinitely."

query "Audit live watcher catch-up behavior after downtime. Does it bound block spans, preserve selective address filters, advance by the slowest shard nextBlock, handle different shard archive heights, and avoid skipping logs or duplicating state changes?"

# 4. Rollback, reorg, and consistency.
query "Trace rollbackGuard from HyperSync response through detectReorg, RegistryService rollback methods, watcher checkpoint updates, rollback guard persistence, cache reload, topology invalidation, and onReorg callbacks. Find any path where rollbackGuard is ignored, overwritten too early, persisted without matching checkpoint state, or merged unsafely across shards."

query "Analyze watcher shard merge semantics. Verify dedupe, sort, rollback guard comparison, archiveHeight handling, nextBlock min selection, failure retry, rollback guard mismatch handling, and progress logging. Identify conditions where one shard can cause missed events, repeated events, false halt, or hidden stale chain view."

query "Audit error classification and halt behavior for HyperSync and watcher failures. Distinguish transport failures, rate limits, payload-too-large, cursor integrity failures, rollback guard mismatch, decoder failures, state validation failures, invalid timestamp, and persistence failures. Identify which should retry, back off, halt, or trigger rediscovery."

# 5. Discovery coverage and checkpoint repair.
query "Trace discovery coverage by protocol and factory path: Uniswap V2, Uniswap V3, Balancer, Curve stable, Curve crypto, listed factories, removals, metadata enrichment, checkpoints, and rediscovery. Identify HyperSync query shapes or checkpoints that can miss pools, duplicate pools, or leave removed pools active."

query "Audit discovery checkpoint math and persistence. Verify checkpointFromNextBlock behavior, toBlock snapshot handling, rollbackGuard storage, protocol-level concurrency ordering, partial failure behavior, and recovery after process restart. Find cases where a failed protocol can advance too far or get stuck forever."

query "Compare discovery's historical HyperSync usage with StateWatcher's live HyperSync usage. Identify shared policy that belongs in src/hypersync versus divergent behavior that is intentional. Recommend repairs to reduce duplicated cursor, field-selection, retry, and rollback semantics."

# 6. Decoding and state mutation.
query "Trace HyperSync log decoding from event signatures and topic0 maps through Decoder.decodeLogs, handler dispatch, V2/V3/Balancer/Curve state updates, enrichment queues, and commitWatcherStatesBatch. Identify mismatched event signatures, missing selected fields, topic parsing assumptions, and decoded body/indexed index risks."

query "Find every place HyperSync logs are sorted, deduped, normalized, or converted before state mutation. Verify blockNumber, transactionIndex, logIndex, transactionHash, address, topic fields, and removed/reorg semantics. Identify whether removed logs or rollback events require extra handling."

query "Audit how placeholder states seeded before HyperSync updates become validated and persisted. Focus on timestamp stamping, token metadata, protocol, fee fields, V3 initialized state, Curve/Balancer enrichment, and invalid-state classification. Find ways HyperSync events can expose incomplete cached state."

# 7. Client config, auth, and runtime operations.
query "Audit HyperSync and HyperRPC configuration: HYPERSYNC_URL, HYPERRPC_URL, ENVIO_API_TOKEN, token injection into hosted URLs, native binding fallback, runtime platform handling, warning behavior, and testability. Identify production startup failure modes and whether operator logs are actionable."

query "Inspect whether rate limit information, retry policy, HTTP timeout, serialization format, query caching, or client logger settings from the installed HyperSync client should be configured here. Separate mandatory fixes from optional operational improvements."

query "Trace metrics and logs for HyperSync health: watcher poll progress, shard archive-height skew, transient errors, integrity errors, halts, discovery scan progress, payload-size errors, cursor stalls, and rollback events. Identify blind spots where repeated HyperSync trouble would not be visible without reading raw logs."

# 8. Tests and repair plan.
query "List the strongest existing tests for HyperSync behavior and what each protects: query_policy, pagination, terminal cursor, watcher poll, watcher state validation, discovery, rollback, and config. Then identify the 15 highest-value missing tests needed before broad HyperSync repairs."

query "Rank the top 15 concrete HyperSync bug risks in this codebase. Prioritize issues that can cause missed pools, stale state, skipped logs, duplicate state updates, wrong checkpoints, unbounded retries, payload failures, reorg corruption, or operator-blind failures. For each, name files, symptoms, and repair strategy."

query "Produce an ordered repair roadmap for all HyperSync usage. Start with correctness and data-loss risks, then operator visibility and halt semantics, then throughput tuning, then cleanup and ownership consolidation. Each item should include owner files, expected tests, and a validation command."

query "Design an ideal live verification checklist for HyperSync on Polygon for this repo: environment variables, token presence, getHeight sanity, small bounded query, discovery dry run, watcher dry run, rollback guard observation, archiveHeight behavior, payload-size test, and restart/resume checks. Include exact repo modules or scripts that should own each check."

# 9. Directed path queries for critical seams.
path_query "HypersyncClient" "StateWatcher"
path_query "client.get()" "watcherCheckpointFromNextBlock()"
path_query "client.get()" "fetchAllLogsWithClient()"
path_query "buildHyperSyncLogQuery()" "discoverProtocol()"
path_query "buildHyperSyncLogQuery()" "StateWatcher"
path_query "rollbackGuard" "detectReorg()"
path_query "rollbackGuard" "rollbackWatcherState()"
path_query "nextBlock" "setCheckpoint()"
path_query "archiveHeight" "watcherProgressMeta()"
path_query "Decoder" "handleWatcherLogs()"
path_query "LogField.BlockNumber" "validatePoolState()"
path_query "HYPERSYNC_MAX_BLOCKS_PER_REQUEST" "fetchAllLogsWithClient()"
path_query "HYPERSYNC_MAX_FILTERS_PER_REQUEST" "client.get()"
path_query "ENVIO_API_TOKEN" "HypersyncClient"

# 10. Chokepoint explanations.
explain "src/hypersync/client.ts"
explain "buildHyperSyncLogQuery()"
explain "fetchAllLogsWithClient()"
explain "StateWatcher"
explain "_buildQueries()"
explain "_pollOnce()"
explain "watcherCheckpointFromNextBlock()"
explain "watcherProgressMeta()"
explain "detectReorg()"
explain "discoverProtocol()"
explain "buildDiscoveryScanQuery()"
explain "commitWatcherStatesBatch()"

{
  echo
  echo "Run complete."
  echo "- Output: $LOG_FILE"
  echo "- Official docs basis: $SOURCES_FILE"
  echo "- Commands: $COMMANDS_FILE"
  echo "- Status: $STATUS_FILE"
} | tee -a "$LOG_FILE"
