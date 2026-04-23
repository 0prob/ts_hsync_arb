import { BlockField, JoinMode, LogField } from "./client.ts";
import {
  HYPERSYNC_BATCH_SIZE,
  HYPERSYNC_MAX_BLOCKS_PER_REQUEST,
} from "../config/index.ts";

export type HyperSyncLogFilter = {
  address?: string[];
  topics?: string[][];
};

export type HyperSyncFieldSelection = {
  log: unknown[];
  block: unknown[];
};

export type HyperSyncLogQuery = {
  fromBlock: number;
  toBlock?: number;
  logs: HyperSyncLogFilter[];
  joinMode: string;
  maxNumLogs: number;
  maxNumBlocks?: number;
  fieldSelection: HyperSyncFieldSelection;
};

export type HyperSyncGetResponse<TLog = unknown> = {
  archiveHeight?: number | string | null;
  rollbackGuard?: Record<string, unknown> | null;
  nextBlock: number | string;
  data?: {
    logs?: TLog[];
  };
};

export const DEFAULT_HYPERSYNC_BLOCK_FIELDS = [
  BlockField.Number,
  BlockField.Timestamp,
];

export const DEFAULT_HYPERSYNC_LOG_FIELDS = [
  LogField.Address,
  LogField.Data,
  LogField.Topic0,
  LogField.Topic1,
  LogField.Topic2,
  LogField.Topic3,
  LogField.BlockNumber,
  LogField.TransactionHash,
  LogField.LogIndex,
  LogField.TransactionIndex,
];

type HyperSyncLogQueryOptions = {
  fromBlock: number;
  logs: HyperSyncLogFilter[];
  toBlock?: number;
  joinMode?: string;
  maxNumLogs?: number;
  maxNumBlocks?: number;
  logFields?: unknown[];
  blockFields?: unknown[];
};

export function buildHyperSyncLogQuery(options: HyperSyncLogQueryOptions): HyperSyncLogQuery {
  const {
    fromBlock,
    logs,
    toBlock,
    joinMode = JoinMode.JoinNothing,
    maxNumLogs = HYPERSYNC_BATCH_SIZE,
    maxNumBlocks,
    logFields = DEFAULT_HYPERSYNC_LOG_FIELDS,
    blockFields = DEFAULT_HYPERSYNC_BLOCK_FIELDS,
  } = options;

  return {
    fromBlock,
    ...(toBlock != null ? { toBlock } : {}),
    logs,
    joinMode,
    maxNumLogs,
    ...(maxNumBlocks != null ? { maxNumBlocks } : {}),
    fieldSelection: {
      log: logFields,
      block: blockFields,
    },
  };
}

export function applyHistoricalHyperSyncQueryPolicy<T extends Record<string, any>>(query: T) {
  return {
    ...query,
    joinMode: query.joinMode ?? JoinMode.JoinNothing,
    maxNumLogs: query.maxNumLogs ?? HYPERSYNC_BATCH_SIZE,
    maxNumBlocks: query.maxNumBlocks ?? HYPERSYNC_MAX_BLOCKS_PER_REQUEST,
  };
}
