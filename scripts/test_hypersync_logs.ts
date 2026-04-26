import assert from "node:assert/strict";

import {
  compareHyperSyncLogs,
  hyperSyncLogIdentityKey,
  normalizeHyperSyncLogInteger,
  normalizeHyperSyncLogMeta,
  topicArrayFromHyperSyncLog,
} from "../src/hypersync/logs.ts";

function address(index: number) {
  return `0x${index.toString(16).padStart(40, "0")}`;
}

const topicA = "0x" + "Aa".repeat(32);
const topicB = "0x" + "Bb".repeat(32);

assert.equal(normalizeHyperSyncLogInteger("12"), 12);
assert.equal(normalizeHyperSyncLogInteger(12.5), null);
assert.equal(normalizeHyperSyncLogInteger(-1), null);

assert.deepEqual(
  topicArrayFromHyperSyncLog({
    topics: [[` ${topicA} `], null, topicB],
    topic0: "0x" + "cc".repeat(32),
  }),
  [topicA.toLowerCase(), topicB.toLowerCase()],
  "topics array should win over topic0/topic1 fields and normalize hashes",
);

assert.deepEqual(
  normalizeHyperSyncLogMeta({
    address: address(1).toUpperCase(),
    blockNumber: "100",
    transactionHash: "  0xABCDEF  ",
    transactionIndex: "2",
    logIndex: "3",
    topic0: topicA,
  }),
  {
    address: address(1),
    blockNumber: 100,
    transactionHash: "0xabcdef",
    transactionIndex: 2,
    logIndex: 3,
    topics: [topicA.toLowerCase()],
  },
);

assert.equal(
  hyperSyncLogIdentityKey({
    transactionHash: "0xABC",
    logIndex: "5",
  }),
  "0xabc:5",
);
assert.equal(
  hyperSyncLogIdentityKey({
    address: address(2).toUpperCase(),
    blockNumber: 8,
    transactionIndex: 1,
    logIndex: 2,
  }),
  `8:1:2:${address(2)}`,
);

const sorted = [
  { blockNumber: 3, transactionIndex: 0, logIndex: 0, address: address(3) },
  { blockNumber: 2, transactionIndex: 1, logIndex: 0, address: address(2) },
  { blockNumber: 2, transactionIndex: 0, logIndex: 1, address: address(1) },
].sort(compareHyperSyncLogs);
assert.deepEqual(
  sorted.map((log) => [log.blockNumber, log.transactionIndex, log.logIndex]),
  [
    [2, 0, 1],
    [2, 1, 0],
    [3, 0, 0],
  ],
);

console.log("HyperSync log checks passed.");
