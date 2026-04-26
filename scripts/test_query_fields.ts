import assert from "node:assert/strict";

import { BlockField, JoinMode, LogField } from "../src/hypersync/client.ts";
import { buildHyperSyncLogQuery } from "../src/hypersync/query_policy.ts";
import { HYPERSYNC_MAX_BLOCKS_PER_REQUEST } from "../src/config/index.ts";

const topic0 = "0x" + "11".repeat(32);
const mixedCaseTopic0 = "0x" + "Aa".repeat(32);

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

{
  const query = buildHyperSyncLogQuery({
    fromBlock: 10,
    logs: [
      {
        address: [
          "  0x1111111111111111111111111111111111111111  ",
          "0x1111111111111111111111111111111111111111".toUpperCase(),
          "not-an-address",
          "",
        ],
        topics: [[mixedCaseTopic0, mixedCaseTopic0.toLowerCase(), "", null as any]],
      },
    ],
  });

  assert.deepEqual(
    query.logs[0].address,
    ["0x1111111111111111111111111111111111111111"],
    "address filters should be normalized, deduplicated, and scrubbed before request construction",
  );
  assert.deepEqual(
    query.logs[0].topics,
    [[mixedCaseTopic0.toLowerCase()]],
    "topic filters should be lowercased and deduplicated before request construction",
  );
  assert.equal(
    query.maxNumBlocks,
    HYPERSYNC_MAX_BLOCKS_PER_REQUEST,
    "shared query construction should bound historical block spans by default",
  );
  assert.equal(
    query.joinMode,
    JoinMode.JoinNothing,
    "shared query construction should preserve HyperSync's native numeric JoinMode enum",
  );
  assert.equal(
    typeof query.joinMode,
    "number",
    "joinMode must cross the native HyperSync boundary as a number, not an enum name string",
  );
}

{
  const query = buildHyperSyncLogQuery({
    fromBlock: 10,
    logs: [{ topics: [[topic0]] }],
    joinMode: "JoinNothing",
  });

  assert.equal(
    query.joinMode,
    JoinMode.JoinNothing,
    "legacy string joinMode names should be normalized to HyperSync's native enum value",
  );
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

assert.throws(
  () =>
    buildHyperSyncLogQuery({
      fromBlock: 1,
      logs: [{ address: ["not-an-address", ""] }],
    }),
  /valid address or topic constraint/i,
  "invalid-only address filters should fail before reaching HyperSync",
);

assert.throws(
  () =>
    buildHyperSyncLogQuery({
      fromBlock: 1,
      logs: [{ topics: [[topic0]] }],
      joinMode: "  ",
    }),
  /joinMode must be a valid JoinMode enum value/i,
  "blank join modes should fail before request construction",
);

assert.throws(
  () =>
    buildHyperSyncLogQuery({
      fromBlock: 1,
      logs: [{ topics: [[topic0]] }],
      joinMode: 99,
    }),
  /joinMode must be a valid JoinMode enum value/i,
  "unknown numeric join modes should fail before request construction",
);

console.log("HyperSync query field checks passed.");
