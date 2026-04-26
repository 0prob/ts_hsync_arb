import assert from "node:assert/strict";

import { buildDiscoveredPoolBatch } from "../src/discovery/helpers.ts";

function address(index: number) {
  return `0x${index.toString(16).padStart(40, "0")}`;
}

{
  const pool = address(100);
  const olderToken = address(1);
  const newerToken0 = address(2);
  const newerToken1 = address(3);

  const batch = buildDiscoveredPoolBatch("UNISWAP_V2", [
    {
      extracted: {
        pool_address: pool.toUpperCase(),
        tokens: [olderToken, address(4)],
        metadata: { fee: 3 },
      },
      rawLog: { blockNumber: 20, transactionIndex: 9, logIndex: 9, transactionHash: "0xolder" },
    },
    {
      extracted: {
        pool_address: address(200),
        tokens: [address(5)],
        metadata: {},
      },
      rawLog: { blockNumber: 21, transactionIndex: 0, logIndex: 0 },
    },
    {
      extracted: {
        pool_address: "not-an-address",
        tokens: [address(6), address(7)],
        metadata: {},
      },
      rawLog: { blockNumber: 22, transactionIndex: 0, logIndex: 0 },
    },
    {
      extracted: {
        pool_address: pool,
        tokens: [newerToken0.toUpperCase(), newerToken0, newerToken1],
        metadata: { fee: 30 },
      },
      rawLog: { blockNumber: 20, transactionIndex: 10, logIndex: 1, transactionHash: "0xnewer" },
    },
    {
      extracted: {
        pool_address: address(201),
        tokens: [address(8), address(9)],
        metadata: {},
      },
      rawLog: { blockNumber: "bad", transactionIndex: 0, logIndex: 0 },
    },
  ]);

  assert.equal(batch.length, 1);
  assert.deepEqual(batch[0], {
    protocol: "UNISWAP_V2",
    block: 20,
    tx: "0xnewer",
    pool_address: pool,
    tokens: [newerToken0, newerToken1],
    metadata: { fee: 30 },
    status: "active",
  });
}

console.log("Discovery helper checks passed.");
