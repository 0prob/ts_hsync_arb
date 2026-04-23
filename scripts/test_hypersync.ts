import assert from "node:assert/strict";

import { fetchAllLogsWithClient } from "../src/hypersync/paginate.ts";
import { watcherCheckpointFromNextBlock } from "../src/state/watcher.ts";

const baseQuery = {
  fromBlock: 100,
  logs: [{ address: ["0x1111111111111111111111111111111111111111"], topics: [["0xtopic"]] }],
};

{
  const seenFromBlocks: number[] = [];
  const result = await fetchAllLogsWithClient(
    {
      async get(query: any) {
        seenFromBlocks.push(Number(query.fromBlock));
        if (query.fromBlock === 100) {
          return {
            archiveHeight: 120,
            rollbackGuard: { first_block_number: 100, first_parent_hash: "0xabc" },
            nextBlock: 110,
            data: { logs: [{ blockNumber: 101 }, { blockNumber: 109 }] },
          };
        }
        return {
          archiveHeight: 120,
          rollbackGuard: { first_block_number: 110, first_parent_hash: "0xdef" },
          nextBlock: 120,
          data: { logs: [{ blockNumber: 115 }] },
        };
      },
    },
    baseQuery,
  );

  assert.deepEqual(seenFromBlocks, [100, 110], "pagination should resume from the authoritative nextBlock cursor");
  assert.equal(result.logs.length, 3, "pagination should accumulate logs across pages");
  assert.equal(result.nextBlock, 120);
  assert.equal(result.archiveHeight, 120);
}

await assert.rejects(
  () =>
    fetchAllLogsWithClient(
      {
        async get() {
          return {
            archiveHeight: 150,
            nextBlock: 100,
            data: { logs: [] },
          };
        },
      },
      baseQuery,
    ),
  /stalled at 100/,
  "non-advancing nextBlock cursors should fail fast instead of looping forever",
);

await assert.rejects(
  () =>
    fetchAllLogsWithClient(
      {
        async get() {
          return {
            archiveHeight: 150,
            nextBlock: 99,
            data: { logs: [] },
          };
        },
      },
      baseQuery,
    ),
  /regressed from 100 to 99/,
  "regressing nextBlock cursors should fail fast instead of corrupting pagination",
);

await assert.rejects(
  () =>
    fetchAllLogsWithClient(
      {
        async get() {
          throw new Error("should not fetch invalid block ranges");
        },
      },
      { ...baseQuery, fromBlock: 200, toBlock: 150 },
    ),
  /invalid block range/,
  "invalid query ranges should be rejected before sending a HyperSync request",
);

const emptySingleBlock = await fetchAllLogsWithClient(
  {
    async get() {
      throw new Error("single-block empty ranges should not fetch");
    },
  },
  { ...baseQuery, fromBlock: 250, toBlock: 250 },
);
assert.deepEqual(
  emptySingleBlock,
  {
    logs: [],
    archiveHeight: null,
    rollbackGuard: null,
    nextBlock: 250,
  },
  "single-block empty ranges should short-circuit without paging",
);

const emptyAtTip = await fetchAllLogsWithClient(
  {
    async get() {
      return {
        archiveHeight: 300,
        nextBlock: 300,
        data: { logs: [] },
      };
    },
  },
  { ...baseQuery, fromBlock: 300 },
);
assert.deepEqual(
  emptyAtTip,
  {
    logs: [],
    archiveHeight: 300,
    rollbackGuard: null,
    nextBlock: 300,
  },
  "tip-aligned empty queries should treat a non-advancing cursor as terminal instead of as an error",
);

assert.equal(
  watcherCheckpointFromNextBlock(301, 300, 301),
  300,
  "watcher should tolerate tip-aligned non-advancing cursors when archive height matches the requested block",
);

assert.throws(
  () => watcherCheckpointFromNextBlock(301, 300, 350),
  /stalled at 301 before archive height 350/,
  "watcher should reject stalled cursors when HyperSync indicates more historical data is still available",
);

console.log("HyperSync checks passed.");
