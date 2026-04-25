
/**
 * src/hypersync/paginate.js — Paginated HyperSync fetching
 *
 * Wraps client.get() in a loop that advances via nextBlock until
 * the target block (or archive height) is reached. Returns all
 * accumulated logs plus the latest rollback guard and resume cursor.
 *
 * HyperSync compliance notes:
 *   - `nextBlock` is the authoritative resume cursor.
 *   - `joinMode: JoinNothing` is enforced unless the caller explicitly sets one,
 *     preventing unnecessary transaction/trace joins for log-only workloads.
 *   - historical `get()` pages are bounded with `maxNumLogs` and `maxNumBlocks`
 *     so sparse backfills stay within HyperSync's query-time budget.
 */

import { client } from "./client.ts";
import {
  applyHistoricalHyperSyncQueryPolicy,
  type HyperSyncGetResponse,
  type HyperSyncLogQuery,
} from "./query_policy.ts";

type HyperSyncPageResult<TLog> = {
  logs: TLog[];
  archiveHeight: number | null;
  rollbackGuard: Record<string, unknown> | null;
  nextBlock: number | null;
  pages: number;
};

type HyperSyncPaginationProgress = {
  pages: number;
  logs: number;
  fromBlock: number;
  nextBlock: number;
  archiveHeight: number | null;
};

type HyperSyncPaginationOptions = {
  maxPages?: number;
  onProgress?: (progress: HyperSyncPaginationProgress) => void;
};

function resolvePaginationTarget(query: HyperSyncLogQuery, nextBlock: number, archiveHeight: number | null) {
  const toBlock = query.toBlock != null ? Number(query.toBlock) : null;
  if (toBlock != null) return toBlock;
  if (archiveHeight != null) return archiveHeight;
  return nextBlock;
}

function isTerminalBoundedCursor(
  query: HyperSyncLogQuery,
  pageFromBlock: number,
  nextBlock: number,
  pageLogCount: number,
) {
  if (query.toBlock == null) return false;
  const targetEnd = Number(query.toBlock);
  if (!Number.isFinite(targetEnd)) return false;
  if (nextBlock !== pageFromBlock) return false;
  if (pageLogCount !== 0) return false;

  // HyperSync can occasionally return a non-advancing cursor on the final
  // empty block of an exclusive toBlock-bounded historical scan. Treat that
  // as completion so discovery can checkpoint the boundary instead of failing.
  return pageFromBlock + 1 >= targetEnd;
}

function parseBlockInteger(name: string, value: unknown) {
  const numeric = Number(value);
  if (!Number.isSafeInteger(numeric) || numeric < 0) {
    throw new Error(`HyperSync ${name} must be a finite non-negative safe integer.`);
  }
  return numeric;
}

function parseOptionalBlockInteger(name: string, value: unknown) {
  if (value == null) return null;
  return parseBlockInteger(name, value);
}

function parsePositiveInteger(name: string, value: unknown, fallback: number) {
  if (value == null) return fallback;
  const numeric = Number(value);
  if (!Number.isSafeInteger(numeric) || numeric <= 0) {
    throw new Error(`HyperSync ${name} must be a finite positive safe integer.`);
  }
  return numeric;
}

function pageLogsFromResponse<TLog>(res: HyperSyncGetResponse<TLog>): TLog[] {
  const logs = res.data?.logs;
  if (logs == null) return [];
  if (!Array.isArray(logs)) {
    throw new Error("HyperSync response data.logs must be an array when provided.");
  }
  return logs;
}

export async function fetchAllLogsWithClient<TLog>(
  hypersyncClient: { get: (query: HyperSyncLogQuery) => Promise<HyperSyncGetResponse<TLog>> },
  query: HyperSyncLogQuery,
  options: HyperSyncPaginationOptions = {},
): Promise<HyperSyncPageResult<TLog>> {
  const initialFromBlock = parseBlockInteger("query fromBlock", query?.fromBlock);
  const initialToBlock = parseOptionalBlockInteger("query toBlock", query?.toBlock);
  if (initialToBlock != null && initialToBlock < initialFromBlock) {
    throw new Error(
      `HyperSync query has invalid block range: fromBlock ${initialFromBlock} exceeds toBlock ${initialToBlock}.`,
    );
  }
  const maxPages = parsePositiveInteger("pagination maxPages", options.maxPages, 10_000);

  if (initialToBlock != null && initialToBlock === initialFromBlock) {
    return {
      logs: [],
      archiveHeight: null,
      rollbackGuard: null,
      nextBlock: initialFromBlock,
      pages: 0,
    };
  }

  const allLogs: TLog[] = [];
  let currentQuery = applyHistoricalHyperSyncQueryPolicy(query);
  let archiveHeight: number | null = null;
  let rollbackGuard: Record<string, unknown> | null = null;
  let lastNextBlock: number | null = null;
  let pages = 0;

  while (true) {
    const pageFromBlock = parseBlockInteger("page fromBlock", currentQuery.fromBlock);
    if (pages >= maxPages) {
      throw new Error(
        `HyperSync pagination exceeded maxPages ${maxPages} before reaching a terminal cursor.`,
      );
    }
    const res = await hypersyncClient.get(currentQuery);
    pages++;

    if (res.archiveHeight != null) {
      archiveHeight = parseBlockInteger("response archiveHeight", res.archiveHeight);
    }
    if (res.rollbackGuard) {
      rollbackGuard = res.rollbackGuard;
    }

    const pageLogs = pageLogsFromResponse(res);
    if (pageLogs.length > 0) {
      allLogs.push(...pageLogs);
    }

    const nextBlock = parseBlockInteger("response nextBlock cursor", res.nextBlock);
    options.onProgress?.({
      pages,
      logs: allLogs.length,
      fromBlock: pageFromBlock,
      nextBlock,
      archiveHeight,
    });
    if (isTerminalBoundedCursor(currentQuery, pageFromBlock, nextBlock, pageLogs.length)) {
      lastNextBlock = Number(currentQuery.toBlock);
      break;
    }
    if (archiveHeight == null && currentQuery.toBlock == null && nextBlock === pageFromBlock) {
      throw new Error(
        `HyperSync nextBlock cursor stalled at ${nextBlock} without archive height; cannot determine whether pagination is complete.`,
      );
    }
    const targetEnd = resolvePaginationTarget(currentQuery, nextBlock, archiveHeight);
    if (nextBlock < pageFromBlock) {
      throw new Error(
        `HyperSync nextBlock cursor regressed from ${pageFromBlock} to ${nextBlock}; refusing to paginate.`,
      );
    }
    if (nextBlock === pageFromBlock) {
      if (targetEnd <= pageFromBlock) {
        lastNextBlock = nextBlock;
        break;
      }
      throw new Error(
        `HyperSync nextBlock cursor stalled at ${nextBlock}; refusing to loop forever.`,
      );
    }

    lastNextBlock = nextBlock;

    if (nextBlock >= targetEnd) {
      break;
    }

    currentQuery = { ...currentQuery, fromBlock: nextBlock };
  }

  return {
    logs: allLogs,
    archiveHeight,
    rollbackGuard,
    nextBlock: lastNextBlock,
    pages,
  };
}

/**
 * Fetch all logs matching `query` from `fromBlock` to the current archive tip.
 *
 * @param {object} query  HyperSync query object (fromBlock, logs, fieldSelection, etc.)
 * @returns {{ logs: object[], archiveHeight: number|null, rollbackGuard: object|null, nextBlock: number|null }}
 */
export async function fetchAllLogs<TLog>(query: HyperSyncLogQuery) {
  return fetchAllLogsWithClient<TLog>(client, query);
}
