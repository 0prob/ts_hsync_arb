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

function normalizeQueryBlock(name: string, value: number | undefined) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || !Number.isInteger(numeric) || numeric < 0) {
    throw new Error(`HyperSync query ${name} must be a finite non-negative integer.`);
  }
  return numeric;
}

function normalizePositiveQueryLimit(name: string, value: number | undefined) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || !Number.isInteger(numeric) || numeric <= 0) {
    throw new Error(`HyperSync query ${name} must be a finite positive integer.`);
  }
  return numeric;
}

function normalizeLogFilter(filter: HyperSyncLogFilter, index: number): HyperSyncLogFilter {
  const address = Array.isArray(filter?.address)
    ? filter.address
        .map((entry) => String(entry ?? "").trim())
        .filter((entry) => entry.length > 0)
    : [];
  const topics = Array.isArray(filter?.topics)
    ? filter.topics
        .map((group) =>
          Array.isArray(group)
            ? group
                .map((entry) => String(entry ?? "").trim())
                .filter((entry) => entry.length > 0)
            : [],
        )
        .filter((group) => group.length > 0)
    : [];

  if (address.length === 0 && topics.length === 0) {
    throw new Error(
      `HyperSync query log filter #${index} must include at least one address or topic constraint.`,
    );
  }

  return {
    ...(address.length > 0 ? { address: [...address] } : {}),
    ...(topics.length > 0 ? { topics: topics.map((group) => [...group]) } : {}),
  };
}

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
  const normalizedFromBlock = normalizeQueryBlock("fromBlock", fromBlock);
  const normalizedToBlock = toBlock != null ? normalizeQueryBlock("toBlock", toBlock) : undefined;
  if (normalizedToBlock != null && normalizedToBlock < normalizedFromBlock) {
    throw new Error(
      `HyperSync query has invalid block range: fromBlock ${normalizedFromBlock} exceeds toBlock ${normalizedToBlock}.`,
    );
  }
  if (!Array.isArray(logs) || logs.length === 0) {
    throw new Error("HyperSync query must include at least one log filter.");
  }
  const normalizedLogs = logs.map((filter, index) => normalizeLogFilter(filter, index));
  const normalizedLogFields = Array.isArray(logFields) ? [...logFields] : [];
  const normalizedBlockFields = Array.isArray(blockFields) ? [...blockFields] : [];
  if (normalizedLogFields.length === 0) {
    throw new Error("HyperSync query must request at least one log field.");
  }
  if (normalizedBlockFields.length === 0) {
    throw new Error("HyperSync query must request at least one block field.");
  }
  const normalizedMaxNumLogs = normalizePositiveQueryLimit("maxNumLogs", maxNumLogs);
  const normalizedMaxNumBlocks =
    maxNumBlocks != null ? normalizePositiveQueryLimit("maxNumBlocks", maxNumBlocks) : undefined;

  return {
    fromBlock: normalizedFromBlock,
    ...(normalizedToBlock != null ? { toBlock: normalizedToBlock } : {}),
    logs: normalizedLogs,
    joinMode,
    maxNumLogs: normalizedMaxNumLogs,
    ...(normalizedMaxNumBlocks != null ? { maxNumBlocks: normalizedMaxNumBlocks } : {}),
    fieldSelection: {
      log: normalizedLogFields,
      block: normalizedBlockFields,
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
