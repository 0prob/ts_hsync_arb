
/**
 * src/hypersync/index.js — Barrel export for HyperSync layer
 */

export { client, Decoder, LogField, BlockField, JoinMode } from "./client.ts";
export { fetchAllLogs } from "./paginate.ts";
export {
  applyHistoricalHyperSyncQueryPolicy,
  buildHyperSyncLogQuery,
  DEFAULT_HYPERSYNC_BLOCK_FIELDS,
  DEFAULT_HYPERSYNC_LOG_FIELDS,
} from "./query_policy.ts";
