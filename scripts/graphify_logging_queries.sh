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

# Logging architecture and ownership.
run graphify query "Trace the logging architecture across logger, runnerLogger, rootLogger, log, metrics, rpc_manager, validation_job, StateWatcher, sendTx, and the TUI. Identify where logs are structured versus plain strings, where context is added or dropped, and which modules act as logging bridges."

run graphify query "Map every path that emits operator-facing information across log, logger.info, logger.warn, logger.error, rootLogger.debug, console.log, console.warn, and console.error. Distinguish structured logs, ad hoc console output, TUI-only logs, startup banners, and paths that bypass the common logging conventions."

run graphify query "Which modules or functions should own event names, field schemas, and logging vocabulary for routing, state, execution, RPC, discovery, warmup, and reorg handling? Identify places where naming is inconsistent, fields are missing, or the same event is described differently in different code paths."

# Thoroughness and observability gaps.
run graphify query "Audit logging thoroughness across the hot paths in runner.ts, StateWatcher, rpc_manager, metrics server, validation_job, buildArbTx, recommendGasParams, and sendTx. Where do important state transitions, cache invalidations, retries, skips, or irreversible decisions happen without enough structured context to troubleshoot later?"

run graphify query "Which functions silently reject, quarantine, skip, back off, or retry work without emitting enough diagnostic detail? Focus on assessRouteResult, prepareExecutionCandidate, filterQuarantinedCandidates, getCurrentFeeSnapshot, getFreshTokenToMaticRate, detectReorg, handleWatcherLogs, recommendGasParams, and sendTx."

run graphify query "Compare the information emitted for success, skip, retry, timeout, stale-state, and error cases across routing, execution, watcher, and RPC layers. Identify asymmetries where failures are under-explained, successes are over-logged, or repeated warnings lack suppression or aggregation."

# Performance and noise.
run graphify query 'Where can logging materially affect performance, latency, or allocation pressure in hot paths? Focus on log payload construction, lazy meta closures, botState.logs updates, high-frequency watcher batches, revalidation loops, RPC backoff logging, metrics server startup, and pretty-print transports. Identify likely CPU, I/O, or memory hotspots caused by logging itself.'

run graphify query "Trace all log fan-out paths where one logical event is emitted multiple times or through multiple sinks, including pino output, botState.logs, console output, and TUI rendering. Identify duplicate emission, inconsistent throttling, and any loops where log volume can grow with route count, pool count, or watcher batch size."

run graphify query "Inspect whether expensive log metadata is computed only when the log level is enabled. Focus on log meta closures, object construction, string interpolation, route/path serialization, error objects, and child logger usage in runner.ts, rpc_manager.ts, and validation_job.ts."

# Clarity and operator usability.
run graphify query "Evaluate operator-facing clarity of logs and TUI output across runner.ts, App.tsx, metrics, and startup/shutdown flows. Which messages are too vague, too noisy, missing identifiers, or missing actionable next steps? Which fields should be promoted into structured data or summarized for humans?"

run graphify query "Trace how recent logs are selected, formatted, truncated, and displayed in the TUI via botState.logs and App.tsx. Identify where important context is lost, where multiline or verbose messages degrade readability, and where severity, component, or event identifiers should be normalized for scanning."

run graphify query "Find opportunities to improve logging by introducing rate limiting, deduplication, sampling, aggregation, or clearer event taxonomy. Prioritize changes that improve troubleshooting signal without increasing hot-path overhead."

# Metrics and logs together.
run graphify query "Compare logs and Prometheus metrics as observability signals across runner.ts, metrics.ts, rpc_manager.ts, validation_job.ts, and execution flows. Where should a repeated log become a metric, where should a metric-backed event still emit a log, and where are there blind spots because neither logs nor metrics cover the transition?"

# Targeted path tracing.
run graphify path "log()" "logger"
run graphify path "log()" "App"
run graphify path "StateWatcher" "log()"
run graphify path "sendTx()" "logFailure()"
run graphify path "recommendGasParams()" "log()"
run graphify path "RpcManager" "logger"
run graphify path "startMetricsServer()" "logger"
run graphify path "validation_job" "logger"
run graphify path "runner.ts" "App"

# Chokepoint explanations.
run graphify explain "log()"
run graphify explain "logger"
run graphify explain "runner.ts"
run graphify explain "StateWatcher"
run graphify explain "sendTx()"
run graphify explain "RpcManager"
run graphify explain "startMetricsServer()"
run graphify explain "App"
