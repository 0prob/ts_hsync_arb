import assert from "node:assert/strict";

import { fetchAllLogsWithClient } from "../src/hypersync/paginate.ts";

const baseQuery = {
  fromBlock: 100,
  logs: [{ address: ["0x1111111111111111111111111111111111111111"], topics: [["0xtopic"]] }],
} as any;

{
  const seenFromBlocks: number[] = [];
  const progress: any[] = [];
  const result = await fetchAllLogsWithClient(
    {
      async get(query: any) {
        seenFromBlocks.push(Number(query.fromBlock));
        if (query.fromBlock === 100) {
          return {
            archiveHeight: "120",
            rollbackGuard: { first_block_number: 100, first_parent_hash: "0xabc" },
            nextBlock: "110",
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
    { onProgress: (entry) => progress.push(entry) },
  );

  assert.deepEqual(seenFromBlocks, [100, 110]);
  assert.equal(result.logs.length, 3);
  assert.equal(result.nextBlock, 120);
  assert.equal(result.archiveHeight, 120);
  assert.equal(result.pages, 2);
  assert.deepEqual(progress.map((entry) => entry.fromBlock), [100, 110]);
  assert.deepEqual(progress.map((entry) => entry.logs), [2, 3]);
}

await assert.rejects(
  () =>
    fetchAllLogsWithClient(
      {
        async get() {
          return {
            archiveHeight: "not-a-block",
            nextBlock: 101,
            data: { logs: [] },
          };
        },
      },
      baseQuery,
    ),
  /response archiveHeight must be a finite non-negative safe integer/,
);

await assert.rejects(
  () =>
    fetchAllLogsWithClient(
      {
        async get() {
          return {
            archiveHeight: 150,
            nextBlock: 100.5,
            data: { logs: [] },
          };
        },
      },
      baseQuery,
    ),
  /response nextBlock cursor must be a finite non-negative safe integer/,
);

await assert.rejects(
  () =>
    fetchAllLogsWithClient(
      {
        async get() {
          return {
            archiveHeight: 150,
            nextBlock: 101,
            data: { logs: {} as any },
          };
        },
      },
      baseQuery,
    ),
  /data\.logs must be an array/,
);

await assert.rejects(
  () =>
    fetchAllLogsWithClient(
      {
        async get(query: any) {
          return {
            archiveHeight: 200,
            nextBlock: Number(query.fromBlock) + 1,
            data: { logs: [] },
          };
        },
      },
      baseQuery,
      { maxPages: 2 },
    ),
  /exceeded maxPages 2/,
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
    pages: 0,
  },
);

{
  const seenFromBlocks: number[] = [];
  const progress: any[] = [];
  const result = await fetchAllLogsWithClient(
    {
      async get(query: any) {
        seenFromBlocks.push(Number(query.fromBlock));
        return {
          archiveHeight: 1_000,
          rollbackGuard: { first_block_number: 300, first_parent_hash: "0xabc" },
          nextBlock: 450,
          data: { logs: [{ blockNumber: 320 }] },
        };
      },
    },
    { ...baseQuery, fromBlock: 300, toBlock: 350 },
    { onProgress: (entry) => progress.push(entry) },
  );

  assert.deepEqual(seenFromBlocks, [300]);
  assert.equal(result.nextBlock, 350);
  assert.equal(result.pages, 1);
  assert.deepEqual(
    progress.map((entry) => entry.nextBlock),
    [350],
    "bounded pagination progress should clamp overshooting nextBlock cursors to the exclusive toBlock target",
  );
}

console.log("HyperSync pagination checks passed.");
