import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { RegistryService } from "../src/db/registry.ts";
import { buildDiscoveryScanQuery, decodeDiscoveryLogs, discoverPoolsWithDeps } from "../src/discovery/discover.ts";
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

  const queryWithSnapshot = buildDiscoveryScanQuery(
    {
      name: "Test Protocol",
      address: "0x1111111111111111111111111111111111111111",
      signature: "event PoolCreated(address indexed token0, address indexed token1, address pool, uint256)",
      decode() {
        return {
          pool_address: "0xpool",
          tokens: ["0xt0", "0xt1"],
          metadata: {},
        };
      },
    } as any,
    500,
    700,
  );
  assert.equal(queryWithSnapshot.fromBlock, 500);
  assert.equal(queryWithSnapshot.toBlock, 701, "discovery should cap each run to the initial chain-height snapshot");

  const queryWithoutSnapshot = buildDiscoveryScanQuery(
    {
      name: "Test Protocol",
      address: "0x1111111111111111111111111111111111111111",
      signature: "event PoolCreated(address indexed token0, address indexed token1, address pool, uint256)",
      decode() {
        return {
          pool_address: "0xpool",
          tokens: ["0xt0", "0xt1"],
          metadata: {},
        };
      },
    } as any,
    500,
    null,
  );
  assert.equal(queryWithoutSnapshot.toBlock, undefined, "discovery should remain unbounded when chain height is unavailable");

  const normalizedDecode = decodeDiscoveryLogs(
    {
      name: "Decode Test",
      address: "0x1111111111111111111111111111111111111111",
      signature: "event PoolCreated(address indexed token0, address indexed token1, address pool, uint256)",
      decode() {
        return {
          pool_address: " 0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA ",
          tokens: [
            " 0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB ",
            null,
            "0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC",
          ],
          metadata: "not-an-object",
        };
      },
    } as any,
    [{ blockNumber: 123, transactionHash: "0xtx" }],
    [{}],
  );
  assert.deepEqual(
    normalizedDecode,
    {
      extractedPools: [
        {
          extracted: {
            pool_address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            tokens: [
              "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
              "0xcccccccccccccccccccccccccccccccccccccccc",
            ],
            metadata: {},
          },
          rawLog: { blockNumber: 123, transactionHash: "0xtx" },
        },
      ],
      errors: 0,
    },
    "discovery decoding should normalize malformed protocol decode output before batching",
  );

  assert.throws(
    () =>
      decodeDiscoveryLogs(
        {
          name: "Decode Test",
          address: "0x1111111111111111111111111111111111111111",
          signature: "event PoolCreated(address indexed token0, address indexed token1, address pool, uint256)",
          decode() {
            return {
              pool_address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              tokens: ["0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "0xcccccccccccccccccccccccccccccccccccccccc"],
              metadata: {},
            };
          },
        } as any,
        [{ blockNumber: 123 }],
        [],
      ),
    /returned 0 decoded log\(s\) for 1 raw log\(s\)/,
    "discovery decoding should fail fast when decoder output length drifts from the raw log batch",
  );

  const rollbackGuards: number[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const mockRegistry = {
    rollbackToBlock() {
      return { poolsRemoved: 0, statesRemoved: 0 };
    },
    setRollbackGuard(guard: any) {
      rollbackGuards.push(Number(guard.block_number));
    },
    getPoolCount() {
      return 3;
    },
    getActivePoolCount() {
      return 2;
    },
  };
  const protocols = {
    ALPHA: { name: "Alpha", address: "0x1" },
    BETA: { name: "Beta", address: "0x2" },
    GAMMA: { name: "Gamma", address: "0x3" },
    DELTA: {
      name: "Delta",
      address: "0x4",
      capabilities: { discovery: false, execution: true },
    },
  };

  const summary = await discoverPoolsWithDeps({
    registry: mockRegistry as any,
    protocols: protocols as any,
    protocolConcurrency: 2,
    getChainHeightFn: async () => 777,
    discoverProtocolFn: async (key: string, _protocol: any, _registry: any, context: any) => {
      assert.equal(context.chainHeight, 777, "protocol discovery should share one chain-height snapshot across the run");
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await sleep(20);
      inFlight--;
      return {
        discovered: 1,
        checkpointBlock: 777,
        rollbackGuard: { block_number: key === "ALPHA" ? 1 : key === "BETA" ? 2 : 3, block_hash: `0x${key}` },
        hydrationPromise: Promise.resolve(0),
      };
    },
    discoverCurveRemovalsFn: async (_registry: any, context: any) => {
      assert.equal(context.chainHeight, 777, "curve removals should use the same chain-height snapshot as protocol scans");
      return { removed: 0, checkpointBlock: 777, rollbackGuard: null };
    },
    detectReorgFn: () => false,
  });

  assert.equal(maxInFlight, 2, "discovery should honor bounded protocol concurrency");
  assert.deepEqual(
    rollbackGuards,
    [1, 2, 3],
    "rollback guards should still be committed in protocol order after concurrent discovery",
  );
  assert.deepEqual(
    summary,
    { totalDiscovered: 3, totalPools: 3, activePools: 2 },
    "concurrent discovery should still return the registry summary",
  );

  registry.close();
  console.log("Discovery checks passed.");
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
