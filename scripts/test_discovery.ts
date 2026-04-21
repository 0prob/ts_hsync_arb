import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { RegistryService } from "../src/db/registry.ts";
import { buildDiscoveredPoolBatch } from "../src/discovery/helpers.ts";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "discovery-test-"));
const dbPath = path.join(tmpDir, "registry.sqlite");

try {
  const registry = new RegistryService(dbPath);

  registry.batchUpsertPools([
    {
      protocol: "CURVE_STABLE_FACTORY",
      block: 10,
      tx: "0xtx-a",
      pool_address: "0xpoola",
      tokens: ["0xt0", "0xt1"],
      metadata: { fee: 1 },
      status: "active",
    },
    {
      protocol: "CURVE_STABLE_FACTORY",
      block: 11,
      tx: "0xtx-b",
      pool_address: "0xpoolb",
      tokens: ["0xt2", "0xt3"],
      metadata: { fee: 2 },
      status: "active",
    },
    {
      protocol: "BALANCER_V2",
      block: 12,
      tx: "0xtx-c",
      pool_address: "0xpoolc",
      tokens: ["0xt4", "0xt5"],
      metadata: {},
      status: "active",
    },
  ]);

  assert.equal(registry.getPoolCountForProtocol("CURVE_STABLE_FACTORY"), 2);
  assert.deepEqual(
    registry.getPoolAddressesForProtocol("CURVE_STABLE_FACTORY").sort(),
    ["0xpoola", "0xpoolb"],
  );

  const removed = registry.batchRemovePools(["0xpoola", "0xpoola", "0xmissing"]);
  assert.equal(removed, 1, "batchRemovePools should dedupe repeated addresses and count real removals only");
  assert.equal(registry.getPool("0xpoola")?.status, "removed");

  const batch = buildDiscoveredPoolBatch("QUICKSWAP_V2", [
    {
      extracted: {
        pool_address: "0xPoolX",
        tokens: ["0xToken0", "0xToken1"],
        metadata: { source: "first" },
      },
      rawLog: { blockNumber: 100, transactionHash: "0xtx1" },
    },
    {
      extracted: {
        pool_address: "0xpoolx",
        tokens: ["0xToken0", "0xToken1"],
        metadata: { source: "latest" },
      },
      rawLog: { blockNumber: 101, transactionHash: "0xtx2" },
    },
    {
      extracted: {
        pool_address: "0xpooly",
        tokens: ["0xToken2"],
        metadata: {},
      },
      rawLog: { blockNumber: 102, transactionHash: "0xtx3" },
    },
  ]);

  assert.equal(batch.length, 1, "buildDiscoveredPoolBatch should drop uninitialized pools and dedupe by address");
  assert.deepEqual(batch[0], {
    protocol: "QUICKSWAP_V2",
    block: 101,
    tx: "0xtx2",
    pool_address: "0xpoolx",
    tokens: ["0xToken0", "0xToken1"],
    metadata: { source: "latest" },
    status: "active",
  });

  registry.close();
  console.log("Discovery checks passed.");
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
