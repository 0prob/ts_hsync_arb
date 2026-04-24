
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

export async function fetchAllLogsWithClient<TLog>(
  hypersyncClient: { get: (query: HyperSyncLogQuery) => Promise<HyperSyncGetResponse<TLog>> },
  query: HyperSyncLogQuery,
): Promise<HyperSyncPageResult<TLog>> {
  if (!Number.isFinite(Number(query?.fromBlock))) {
    throw new Error("HyperSync query must include a finite fromBlock.");
  }
  if (query?.toBlock != null && !Number.isFinite(Number(query.toBlock))) {
    throw new Error("HyperSync query toBlock must be finite when provided.");
  }

  const initialFromBlock = Number(query.fromBlock);
  const initialToBlock = query?.toBlock != null ? Number(query.toBlock) : null;
  if (initialToBlock != null && initialToBlock < initialFromBlock) {
    throw new Error(
      `HyperSync query has invalid block range: fromBlock ${initialFromBlock} exceeds toBlock ${initialToBlock}.`,
    );
  }

  if (initialToBlock != null && initialToBlock === initialFromBlock) {
    return {
      logs: [],
      archiveHeight: null,
      rollbackGuard: null,
      nextBlock: initialFromBlock,
    };
  }

  const allLogs: TLog[] = [];
  let currentQuery = applyHistoricalHyperSyncQueryPolicy(query);
  let archiveHeight = null;
  let rollbackGuard: Record<string, unknown> | null = null;
  let lastNextBlock = null;
  let pages = 0;

  while (true) {
    const pageFromBlock = Number(currentQuery.fromBlock);
    const res = await hypersyncClient.get(currentQuery);
    pages++;

    if (res.archiveHeight != null) {
      archiveHeight = Number(res.archiveHeight);
    }
    if (res.rollbackGuard) {
      rollbackGuard = res.rollbackGuard;
    }

    const pageLogs = res.data?.logs ?? [];
    if (pageLogs.length > 0) {
      allLogs.push(...pageLogs);
    }

    const nextBlock = Number(res.nextBlock);
    if (!Number.isFinite(nextBlock)) {
      throw new Error(
        "HyperSync response did not include a finite nextBlock cursor; cannot paginate safely."
      );
    }
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

  if (pages > 1) {
    console.log(`    (fetched ${pages} pages, ${allLogs.length} total logs)`);
  }

  return {
    logs: allLogs,
    archiveHeight,
    rollbackGuard,
    nextBlock: lastNextBlock,
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
