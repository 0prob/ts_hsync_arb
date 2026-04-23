import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";

import { fetchAllLogsWithClient } from "../src/hypersync/paginate.ts";
import { StateWatcher, WATCHER_TOPIC0, sortWatcherLogs, watcherCheckpointFromNextBlock } from "../src/state/watcher.ts";
import { handleWatcherLogs } from "../src/state/watcher_state_ops.ts";
import { client } from "../src/hypersync/client.ts";

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

{
  let getPoolMetaCalls = 0;
  const registry = {
    getPoolMeta(address: string) {
      getPoolMetaCalls++;
      return {
        pool_address: address,
        protocol: "UNISWAP_V2",
        tokens: [
          "0x0000000000000000000000000000000000000001",
          "0x0000000000000000000000000000000000000002",
        ],
      };
    },
  };
  const cache = new Map([
    [
      "0xpool",
      {
        poolId: "0xpool",
        protocol: "UNISWAP_V2",
        tokens: [
          "0x0000000000000000000000000000000000000001",
          "0x0000000000000000000000000000000000000002",
        ],
        token0: "0x0000000000000000000000000000000000000001",
        token1: "0x0000000000000000000000000000000000000002",
        reserve0: 1n,
        reserve1: 2n,
        fee: 997n,
        timestamp: Date.now(),
      },
    ],
  ]);
  const logs = [
    { address: "0xpool", topic0: WATCHER_TOPIC0.V2_SYNC, blockNumber: 401, transactionIndex: 0, logIndex: 1 },
    { address: "0xpool", topic0: WATCHER_TOPIC0.V2_SYNC, blockNumber: 401, transactionIndex: 0, logIndex: 2 },
  ];
  const decoded = [
    { body: [{ val: 11n }, { val: 12n }] },
    { body: [{ val: 21n }, { val: 22n }] },
  ];

  const changedAddrs = await handleWatcherLogs({
    logs,
    decoded,
    registry,
    cache,
    closed: () => false,
    topic0: WATCHER_TOPIC0,
    refreshBalancer: async () => {},
    refreshCurve: async () => {},
    enqueueEnrichment: () => Promise.resolve(),
    commitStates(updates: any[]) {
      for (const update of updates) {
        cache.set(update.addr, update.state);
      }
      return updates.map((update) => update.addr);
    },
  });

  assert.equal(getPoolMetaCalls, 1, "watcher should resolve pool metadata once per address within a batch");
  assert.deepEqual([...changedAddrs], ["0xpool"]);
  assert.equal(cache.get("0xpool")?.reserve0, 21n, "watcher should still apply the latest in-batch state update");
}

{
  const registry = {
    getCheckpoint: () => null,
    getGlobalCheckpoint: () => 777,
  };
  const watcher = new StateWatcher(registry as any, new Map() as any) as any;
  const originalGetHeight = client.getHeight;

  let getHeightCalled = false;
  client.getHeight = async () => {
    getHeightCalled = true;
    return 999;
  };
  watcher._loop = async () => {};

  try {
    await watcher.start(undefined);
    assert.equal(watcher.lastBlock, 777, "watcher should resume from the global checkpoint before falling back to lookback backfill");
    assert.equal(getHeightCalled, false, "global checkpoint startup should avoid an unnecessary chain-height lookback query");
  } finally {
    client.getHeight = originalGetHeight;
  }
}

{
  const registry = {
    getCheckpoint: () => null,
    setCheckpoint: () => {},
    setRollbackGuard: () => {},
    rollbackToBlock: () => ({ poolsRemoved: 0, statesRemoved: 0 }),
  };
  const cache = new Map(
    Array.from({ length: 17_000 }, (_, i) => [
      `0x${String(i + 1).padStart(40, "0")}`,
      { poolId: i + 1 },
    ]),
  );

  const watcher = new StateWatcher(registry as any, cache as any) as any;
  const originalGet = client.get;
  const originalDecoder = watcher._decoder;
  const seenFilterCounts: number[] = [];

  watcher._decoder = { decodeLogs: async () => [] };
  client.get = async (query: any) => {
    seenFilterCounts.push(Array.isArray(query.logs) ? query.logs.length : 0);
    return {
      archiveHeight: 500,
      nextBlock: 401 + seenFilterCounts.length,
      data: { logs: [] },
    };
  };

  try {
    watcher._lastBlock = 400;
    watcher._running = true;
    watcher._watchedAddresses = Array.from(cache.keys());
    watcher._watchedAddressSet = new Set(watcher._watchedAddresses);
    const res = await watcher._pollOnce();
    assert.deepEqual(
      seenFilterCounts,
      [8, 8, 1],
      "watcher should split large watchlists across multiple HyperSync requests",
    );
    assert.equal(res.nextBlock, 402, "watcher should advance at the slowest shard cursor");
    assert.equal(res.archiveHeight, 500);
  } finally {
    client.get = originalGet;
    watcher._decoder = originalDecoder;
  }
}

{
  const sorted = sortWatcherLogs([
    { address: "0xc", blockNumber: 101, transactionIndex: 2, logIndex: 5 },
    { address: "0xb", blockNumber: 100, transactionIndex: 9, logIndex: 1 },
    { address: "0xa", blockNumber: 100, transactionIndex: 1, logIndex: 7 },
    { address: "0xd", blockNumber: 100, transactionIndex: 1, logIndex: 2 },
  ]);
  assert.deepEqual(
    sorted.map((log: any) => `${log.blockNumber}:${log.transactionIndex}:${log.logIndex}:${log.address}`),
    [
      "100:1:2:0xd",
      "100:1:7:0xa",
      "100:9:1:0xb",
      "101:2:5:0xc",
    ],
    "watcher log merges should be normalized into block/tx/log order before state application",
  );
}

{
  const registry = {
    getCheckpoint: () => null,
    setCheckpoint: () => {},
    setRollbackGuard: () => {},
    rollbackToBlock: () => ({ poolsRemoved: 0, statesRemoved: 0 }),
  };
  const cache = new Map(
    Array.from({ length: 17_000 }, (_, i) => [
      `0x${String(i + 1).padStart(40, "0")}`,
      { poolId: i + 1 },
    ]),
  );

  const watcher = new StateWatcher(registry as any, cache as any) as any;
  const originalGet = client.get;
  const originalDecoder = watcher._decoder;
  let inFlight = 0;
  let maxInFlight = 0;

  watcher._decoder = { decodeLogs: async (logs: any[]) => logs.map(() => ({})) };
  client.get = async (query: any) => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await sleep(Array.isArray(query.logs) && query.logs.length === 1 ? 30 : 10);
    inFlight--;
    return {
      rollbackGuard: { first_block_number: 400, first_parent_hash: "0xabc" },
      archiveHeight: 500,
      nextBlock: 402,
      data: {
        logs: Array.isArray(query.logs) && query.logs.length === 1
          ? [{ address: "0x2", blockNumber: 401, transactionIndex: 2, logIndex: 9 }]
          : [{ address: "0x1", blockNumber: 401, transactionIndex: 1, logIndex: 4 }],
      },
    };
  };

  try {
    watcher._lastBlock = 400;
    watcher._running = true;
    watcher._watchedAddresses = Array.from(cache.keys());
    watcher._watchedAddressSet = new Set(watcher._watchedAddresses);
    const res = await watcher._pollOnce();
    assert.equal(maxInFlight, 3, "watcher should issue shard requests in parallel");
    assert.deepEqual(
      res.data.logs.map((log: any) => log.address),
      ["0x1", "0x2"],
      "parallel shard responses should be re-sorted into deterministic chain order",
    );
  } finally {
    client.get = originalGet;
    watcher._decoder = originalDecoder;
  }
}

{
  const registry = {
    getCheckpoint: () => null,
    setCheckpoint: () => {},
    setRollbackGuard: () => {},
    rollbackToBlock: () => ({ poolsRemoved: 0, statesRemoved: 0 }),
  };
  const cache = new Map();
  const watcher = new StateWatcher(registry as any, cache as any) as any;

  watcher._running = true;
  const sleepPromise = watcher._sleep(5_000);
  await sleep(20);
  const started = Date.now();
  await watcher.stop();
  await sleepPromise;
  assert.ok(Date.now() - started < 250, "watcher stop should interrupt backoff sleeps promptly");
}

console.log("HyperSync checks passed.");
