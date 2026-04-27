#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FOCUS_PATH="${1:-src}"
UPDATE_PATH="${GRAPHIFY_UPDATE_PATH:-.}"

cd "$ROOT_DIR"

run() {
  printf '\n==> %s\n' "$*"
  "$@"
}

run graphify update "$UPDATE_PATH"

# SQL / SQLite compatibility and transaction semantics.
run graphify query "Trace the SQL and SQLite stack end to end across src/db/sqlite.ts, src/db/registry.ts, registry helper modules, and every caller that depends on transaction or prepared-statement behavior. Identify compatibility assumptions carried over from better-sqlite3, statement caching behavior, pragma choices, nested transaction semantics, savepoint correctness, and places where node:sqlite behavior could differ in subtle but production-relevant ways."

run graphify query "Audit transaction boundaries, atomicity, and rollback semantics across CompatDatabase.transaction, RegistryService writes, checkpoint updates, rollback guard writes, history writes, pool upserts, token metadata writes, and watcher persistence. Rank the top 10 places where partial commit, wrong nesting, or exception handling could leave persistent state inconsistent with in-memory cache state."

run graphify query "Inspect statement preparation and statement cache ownership across CompatDatabase.prepare, RegistryService._stmt, and helper modules. Identify possible cache growth, duplicate statement keys, stale prepared statements after migration or schema drift, and queries that are hot enough to deserve dedicated ownership or instrumentation."

run graphify query "Evaluate WAL, synchronous, journaling, and durability choices in the SQLite setup. Explain the practical tradeoffs of the current PRAGMAs for this workload, including startup, discovery bursts, watcher writes, crash recovery, reorg rollback safety, and possible database-lock or fsync edge cases."

# Schema, migrations, and data model quality.
run graphify query "Map the registry schema and data model across pools, checkpoints, rollback guards, history, token metadata, and any auxiliary tables. Identify which columns are sources of truth, which fields are denormalized or cached, which JSON blobs hide queryable structure, and where the schema makes correctness or troubleshooting harder than it needs to be."

run graphify query "Audit schema migration logic in src/db/registry.ts and related helpers. Look for migrations that are not idempotent, rely on implicit column state, assume a clean boot order, skip backfills, or could break older databases silently. Rank the most credible migration and backward-compatibility risks."

run graphify query "Which indexes, uniqueness constraints, foreign-key-like invariants, or check constraints are missing from the current SQLite schema? Focus on preventing duplicate pools, inconsistent checkpoints, malformed token metadata, impossible status transitions, and historical rollback gaps. Separate correctness-critical constraints from performance-only indexes."

run graphify query "Find every place where SQL rows are converted into in-memory objects and every place where in-memory state is persisted back to SQLite. Identify lossy transforms, JSON parse/stringify fragility, implicit defaults, nullable-field ambiguity, address normalization inconsistencies, and schema-shape drift risks."

# Query correctness and performance.
run graphify query "Trace the hottest database read and write paths across startup, discovery, warmup, watcher persistence, rollback, state reload, token enrichment, and topology refresh. Rank the top 10 SQL operations most likely to dominate latency, contention, or allocation pressure, and explain which call sites trigger them."

run graphify query "Inspect whether repeated registry access patterns cause unnecessary query amplification. Focus on getPools, getActivePoolsMeta, getPoolMeta, getTokenMeta, getCheckpoint, stale-state scans, history reads, and any loops in runner.ts, discovery, warmup, watcher, or topology code that may turn one logical operation into many SQL round trips."

run graphify query "Audit SQL query shapes for correctness and performance. Identify queries that scan too broadly, deserialize too much JSON, fetch more columns than needed, miss obvious indexes, or use application-side filtering where SQLite should do the work."

run graphify query "If you had to profile and optimize the DB layer first, which 10 queries, tables, or access paths would you instrument immediately, and what metrics would you collect? Ground the answer in actual call frequency, fan-out, startup critical path impact, and watcher-loop sensitivity."

# Caching ownership and invalidation.
run graphify query "Trace every cache in the system across stateCache, RouteCache, registry meta caching, statement caching, gas/fee caching, topology caching, token metadata caching, watcher checkpoint state, and any execution quarantine or memoized state. Identify each cache's owner, population path, invalidation path, freshness policy, and whether ownership is currently too scattered."

run graphify query "Audit cache invalidation and stale-read risks across discovery, registry writes, watcher updates, rollback handling, topology refresh, route revalidation, token metadata hydration, and pool disablement. Rank the top 10 places where persistent DB state and in-memory caches can diverge long enough to cause wrong routing, stale operator output, or masked correctness bugs."

run graphify query "Compare the responsibilities of RegistryMetaCache, RegistryService, createRegistryRepositories, state/cache_utils.ts, StateWatcher reload flows, and runner.ts helper logic. Identify overlapping cache abstractions, duplicated read models, and places where cache mutation should move behind a narrower interface."

run graphify query "Which caches should be write-through, write-behind, read-through, versioned, or explicitly throwaway? Evaluate stateCache, routeCache, statement cache, registry metadata cache, gas estimate cache, and topology cache in terms of correctness, observability, and recovery after crash or reorg."

run graphify query "Find every place where caches are cleared wholesale, partially invalidated, or implicitly bypassed. Identify where the invalidation policy is under-specified, too broad, too narrow, or coupled to orchestration code instead of the data owner."

# Repair and improvement roadmap.
run graphify query "Rank the top 10 real bug risks across SQL, DB, and caching layers. Prioritize issues that can cause stale state, silent data corruption, partial writes, duplicate records, wrong checkpoint resume, rollback mistakes, hidden cache divergence, or performance cliffs that degrade correctness under load."

run graphify query "Rank the top 10 highest-leverage engineering improvements for the SQL, DB, and caching layers. Prioritize improvements that materially increase correctness, migration safety, observability, testability, and hot-path performance. For each, name likely owner files and the main reason it matters."

run graphify query "What test additions would buy the most confidence in the database and cache layers? Focus on transaction rollback behavior, nested transaction/savepoint semantics, migration safety, checkpoint resume, rollback-to-block correctness, state reload consistency, cache invalidation, and address-normalization invariants."

run graphify query "If you were repairing this storage architecture incrementally, what should the roadmap be? Produce one ordered list that starts with immediate correctness safeguards, then medium-term schema and cache-ownership cleanup, then performance and observability work."

# Directed path queries for critical seams.
run graphify path "CompatDatabase" "RegistryService"
run graphify path ".transaction()" "RegistryService"
run graphify path "RegistryService" "reloadCacheFromRegistry()"
run graphify path "RegistryService" "RouteCache"
run graphify path "RegistryMetaCache" "getActivePoolsMeta()"
run graphify path "rollbackToBlock()" "reloadWatcherCache()"
run graphify path ".setCheckpoint()" "StateWatcher"
run graphify path ".batchUpsertPools()" "discoverPools()"
run graphify path ".batchUpdateStates()" "StateWatcher"
run graphify path "reloadCacheFromRegistry()" "simulateHop()"
run graphify path "createRegistryRepositories()" "runner.ts"
run graphify path ".getPoolMeta()" "refreshCycles()"
run graphify path "getTokenMeta()" "PriceOracle"

# Chokepoint explanations.
run graphify explain "CompatDatabase"
run graphify explain ".transaction()"
run graphify explain "RegistryService"
run graphify explain "RegistryMetaCache"
run graphify explain "rollbackToBlock()"
run graphify explain "reloadCacheFromRegistry()"
run graphify explain ".setCheckpoint()"
run graphify explain ".batchUpsertPools()"
run graphify explain ".batchUpdateStates()"
