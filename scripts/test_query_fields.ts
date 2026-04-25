import assert from "node:assert/strict";

import { BlockField, LogField } from "../src/hypersync/client.ts";
import { buildHyperSyncLogQuery } from "../src/hypersync/query_policy.ts";

const topic0 = "0x" + "11".repeat(32);

{
  const logFields = [
    "  Address  ",
    LogField.BlockNumber,
    LogField.BlockNumber,
    "",
    null,
    LogField.TransactionHash,
  ] as unknown[];
  const blockFields = ["  Number  ", BlockField.Number, undefined, BlockField.Timestamp] as unknown[];

  const query = buildHyperSyncLogQuery({
    fromBlock: 10,
    logs: [{ topics: [[topic0]] }],
    logFields,
    blockFields,
  });

  assert.deepEqual(
    query.fieldSelection.log,
    ["Address", LogField.BlockNumber, LogField.TransactionHash],
    "log fields should be trimmed, deduplicated, and scrubbed of blank values",
  );
  assert.deepEqual(
    query.fieldSelection.block,
    ["Number", BlockField.Timestamp],
    "block fields should be trimmed, deduplicated, and scrubbed of blank values",
  );
  assert.equal(logFields[0], "  Address  ", "field normalization must not mutate caller arrays");
  assert.equal(blockFields[0], "  Number  ", "field normalization must not mutate caller arrays");
}

assert.throws(
  () =>
    buildHyperSyncLogQuery({
      fromBlock: 1,
      logs: [{ topics: [[topic0]] }],
      logFields: [LogField.Address, LogField.TransactionHash],
    }),
  /log fields must include BlockNumber/i,
  "log queries should keep blockNumber available for checkpoint/progress handling",
);

assert.throws(
  () =>
    buildHyperSyncLogQuery({
      fromBlock: 1,
      logs: [{ topics: [[topic0]] }],
      blockFields: [BlockField.Timestamp],
    }),
  /block fields must include Number/i,
  "block queries should keep block number available for rollback/progress metadata",
);

assert.throws(
  () =>
    buildHyperSyncLogQuery({
      fromBlock: 1,
      logs: [{ topics: [[topic0]] }],
      logFields: ["", null],
    }),
  /at least one log field/i,
  "blank-only log field selections should fail early",
);

console.log("HyperSync query field checks passed.");
