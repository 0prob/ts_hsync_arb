
/**
 * src/utils/metrics.js — Prometheus metrics for monitoring
 *
 * Provides a centralized registry and standard metrics for:
 *   - Search performance (paths evaluated, arbs found)
 *   - Execution latency (submission, confirmation)
 *   - Profitability (gross, net)
 *   - System health (RPC errors, poll counts)
 */

import client from "prom-client";
import http from "http";
import { logger } from "./logger.ts";

// ─── Registry ──────────────────────────────────────────────────

const register = new client.Registry();

// Add default metrics (CPU, memory, etc.)
client.collectDefaultMetrics({ register });

// ─── Metrics Definitions ───────────────────────────────────────

/** Counter for total paths evaluated in the routing layer */
export const pathsEvaluated = new client.Counter({
  name: "arb_paths_evaluated_total",
  help: "Total number of arbitrage paths evaluated",
  labelNames: ["pass"],
  registers: [register],
});

/** Counter for total profitable opportunities found */
export const arbsFound = new client.Counter({
  name: "arb_opportunities_found_total",
  help: "Total number of profitable arbitrage opportunities found",
  labelNames: ["pass"],
  registers: [register],
});

/** Histogram for per-pass shortlist size entering optimization */
export const candidateShortlistSize = new client.Histogram({
  name: "arb_candidate_shortlist_size",
  help: "Number of candidates shortlisted for optimization in a pass",
  buckets: [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144],
  registers: [register],
});

/** Histogram for per-pass optimized candidate count */
export const candidateOptimizedCount = new client.Histogram({
  name: "arb_candidate_optimized_count",
  help: "Number of shortlisted candidates that were optimized in a pass",
  buckets: [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144],
  registers: [register],
});

/** Histogram for per-pass profitable candidate count after assessment */
export const candidateProfitableCount = new client.Histogram({
  name: "arb_candidate_profitable_count",
  help: "Number of profitable candidates remaining after assessment in a pass",
  buckets: [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144],
  registers: [register],
});

/** Histogram for the profitable yield ratio of the candidate pipeline */
export const candidateProfitableYield = new client.Histogram({
  name: "arb_candidate_profitable_yield_ratio",
  help: "Profitable candidates divided by shortlisted candidates in a pass",
  buckets: [0, 0.05, 0.1, 0.2, 0.35, 0.5, 0.75, 1],
  registers: [register],
});

/** Histogram for transaction latency (ms) */
export const txLatency = new client.Histogram({
  name: "arb_tx_latency_ms",
  help: "Transaction latency in milliseconds",
  labelNames: ["stage"], // e.g., 'submission', 'confirmation'
  buckets: [100, 250, 500, 1000, 2500, 5000, 10000, 30000],
  registers: [register],
});

/** Gauge for current gas price (gwei) */
export const gasPriceGwei = new client.Gauge({
  name: "arb_gas_price_gwei",
  help: "Current gas price in gwei",
  registers: [register],
});

/** Counter for RPC errors */
export const rpcErrors = new client.Counter({
  name: "arb_rpc_errors_total",
  help: "Total number of RPC errors encountered",
  labelNames: ["method"],
  registers: [register],
});

/** Counter for RPC endpoint switches due to rate limits or errors */
export const rpcSwitches = new client.Counter({
  name: "arb_rpc_switches_total",
  help: "Total number of times the RPC endpoint was switched",
  labelNames: ["reason"],
  registers: [register],
});

/** Histogram for RPC endpoint latency (ms) */
export const rpcLatencyMs = new client.Histogram({
  name: "arb_rpc_latency_ms",
  help: "RPC endpoint probe latency in milliseconds",
  labelNames: ["endpoint"],
  buckets: [10, 50, 100, 250, 500, 1000],
  registers: [register],
});

/** Gauge for registry invalid pool count (updated by validation_job) */
export const registryInvalidPools = new client.Gauge({
  name: "arb_registry_invalid_pools",
  help: "Number of active pools that failed metadata validation",
  registers: [register],
});

/**
 * Accessor for the full metrics object — used by validation_job.js to avoid
 * circular imports when metrics may not be loaded.
 *
 * @returns {{ registry_invalid_pools: Gauge }}
 */
export function getMetrics() {
  return { registry_invalid_pools: registryInvalidPools };
}

// ─── Metrics Server ────────────────────────────────────────────

let server: http.Server | null = null;

/**
 * Start a simple HTTP server to expose metrics for Prometheus.
 * @param {number} port  Port to listen on (default 9090)
 */
export function startMetricsServer(port = 9090) {
  if (server) return;

  server = http.createServer(async (req, res) => {
    if (req.url === "/metrics") {
      try {
        res.setHeader("Content-Type", register.contentType);
        res.end(await register.metrics());
      } catch (err) {
        res.statusCode = 500;
        res.end((err as Error).message);
      }
    } else {
      res.statusCode = 404;
      res.end("Not Found");
    }
  });

  server.listen(port, () => {
    logger.info(`[metrics] Prometheus metrics server listening on port ${port}`);
  });
}

/**
 * Stop the metrics server.
 */
export function stopMetricsServer() {
  if (server) {
    server.close();
    server = null;
  }
}
