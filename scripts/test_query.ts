import assert from "node:assert/strict";

import {
  buildHyperSyncLogQuery,
  DEFAULT_HYPERSYNC_BLOCK_FIELDS,
  DEFAULT_HYPERSYNC_LOG_FIELDS,
} from "../src/hypersync/query_policy.ts";

{
  const sourceLogs = [
    {
      address: ["0x1111111111111111111111111111111111111111"],
      topics: [["0xtopic-a", "0xtopic-b"]],
    },
  ];
  const sourceLogFields = [...DEFAULT_HYPERSYNC_LOG_FIELDS];
  const sourceBlockFields = [...DEFAULT_HYPERSYNC_BLOCK_FIELDS];

  const query = buildHyperSyncLogQuery({
    fromBlock: 100,
    toBlock: 150,
    logs: sourceLogs,
    logFields: sourceLogFields,
    blockFields: sourceBlockFields,
  });

  sourceLogs[0].address?.push("0x2222222222222222222222222222222222222222");
  sourceLogs[0].topics?.[0]?.push("0xtopic-c");
  sourceLogFields.push("extra-log-field");
  sourceBlockFields.push("extra-block-field");

  assert.deepEqual(
    query.logs,
    [
      {
        address: ["0x1111111111111111111111111111111111111111"],
        topics: [["0xtopic-a", "0xtopic-b"]],
      },
    ],
    "query building should snapshot log filters instead of retaining mutable caller-owned arrays",
  );
  assert.deepEqual(
    query.fieldSelection.log,
    DEFAULT_HYPERSYNC_LOG_FIELDS,
    "query building should snapshot requested log fields",
  );
  assert.deepEqual(
    query.fieldSelection.block,
    DEFAULT_HYPERSYNC_BLOCK_FIELDS,
    "query building should snapshot requested block fields",
  );
}

assert.throws(
  () =>
    buildHyperSyncLogQuery({
      fromBlock: -1,
      logs: [{ topics: [["0xtopic"]] }],
    }),
  /fromBlock/,
  "query building should reject negative fromBlock values",
);

assert.throws(
  () =>
    buildHyperSyncLogQuery({
      fromBlock: 200,
      toBlock: 150,
      logs: [{ topics: [["0xtopic"]] }],
    }),
  /invalid block range/,
  "query building should reject inverted block ranges before pagination begins",
);

assert.throws(
  () =>
    buildHyperSyncLogQuery({
      fromBlock: 100,
      logs: [],
    }),
  /at least one log filter/,
  "query building should reject empty log-filter lists",
);

assert.throws(
  () =>
    buildHyperSyncLogQuery({
      fromBlock: 100,
      logs: [{}],
    }),
  /at least one address or topic constraint/,
  "query building should reject unconstrained log filters that would otherwise issue a dangerously broad query",
);

assert.throws(
  () =>
    buildHyperSyncLogQuery({
      fromBlock: 100,
      logs: [{ topics: [["0xtopic"]] }],
      maxNumLogs: 0,
    }),
  /maxNumLogs/,
  "query building should reject non-positive page sizes",
);

console.log("Query checks passed.");
