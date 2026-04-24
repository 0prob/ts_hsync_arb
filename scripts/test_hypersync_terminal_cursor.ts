import assert from "node:assert/strict";

import { fetchAllLogsWithClient } from "../src/hypersync/paginate.ts";

const baseQuery = {
  fromBlock: 100,
  logs: [{ address: ["0x1111111111111111111111111111111111111111"], topics: [["0xtopic"]] }],
};

const boundedTerminalPage = await fetchAllLogsWithClient(
  {
    async get(query: any) {
      assert.equal(query.fromBlock, 300, "terminal bounded-cursor regression should only fetch the last requested block");
      assert.equal(query.toBlock, 301, "terminal bounded-cursor regression should preserve the exclusive upper bound");
      return {
        archiveHeight: 350,
        nextBlock: 300,
        data: { logs: [] },
      };
    },
  },
  { ...baseQuery, fromBlock: 300, toBlock: 301 },
);

assert.deepEqual(
  boundedTerminalPage,
  {
    logs: [],
    archiveHeight: 350,
    rollbackGuard: null,
    nextBlock: 301,
  },
  "bounded discovery scans should treat a stalled final empty block as complete and advance to the exclusive bound",
);

await assert.rejects(
  () =>
    fetchAllLogsWithClient(
      {
        async get() {
          return {
            archiveHeight: 350,
            nextBlock: 300,
            data: { logs: [] },
          };
        },
      },
      { ...baseQuery, fromBlock: 300, toBlock: 305 },
    ),
  /stalled at 300/,
  "bounded scans should still reject a stalled cursor when more historical range remains",
);

console.log("HyperSync terminal bounded cursor checks passed.");
