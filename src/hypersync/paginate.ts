
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

import { client, JoinMode } from "./client.ts";
import {
  HYPERSYNC_BATCH_SIZE,
  HYPERSYNC_MAX_BLOCKS_PER_REQUEST,
} from "../config/index.ts";

/**
 * Fetch all logs matching `query` from `fromBlock` to the current archive tip.
 *
 * @param {object} query  HyperSync query object (fromBlock, logs, fieldSelection, etc.)
 * @returns {{ logs: object[], archiveHeight: number|null, rollbackGuard: object|null, nextBlock: number|null }}
 */
export async function fetchAllLogs(query: any) {
  const allLogs = [];
  let currentQuery = {
    ...query,
    joinMode: query.joinMode ?? JoinMode.JoinNothing,
    maxNumLogs: query.maxNumLogs ?? HYPERSYNC_BATCH_SIZE,
    maxNumBlocks: query.maxNumBlocks ?? HYPERSYNC_MAX_BLOCKS_PER_REQUEST,
  };
  let archiveHeight = null;
  let rollbackGuard = null;
  let lastNextBlock = null;
  let pages = 0;

  while (true) {
    const res = await client.get(currentQuery);
    pages++;

    if (res.archiveHeight != null) {
      archiveHeight = Number(res.archiveHeight);
    }
    if (res.rollbackGuard) {
      rollbackGuard = res.rollbackGuard;
    }

    if (res.data?.logs?.length > 0) {
      allLogs.push(...res.data.logs);
    }

    const nextBlock = Number(res.nextBlock);
    if (!Number.isFinite(nextBlock)) {
      throw new Error(
        "HyperSync response did not include a finite nextBlock cursor; cannot paginate safely."
      );
    }
    lastNextBlock = nextBlock;
    const targetEnd = currentQuery.toBlock ?? archiveHeight ?? nextBlock;

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
