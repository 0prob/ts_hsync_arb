import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";

import { fetchAllLogsWithClient } from "../src/hypersync/paginate.ts";
import {
  StateWatcher,
  WATCHER_TOPIC0,
  sortWatcherLogs,
  watcherCheckpointFromNextBlock,
  watcherLogger,
  watcherProgressMeta,
  watcherErrorBackoffMeta,
  watcherReorgMeta,
  classifyWatcherPollError,
  watcherErrorBackoffMs,
  watcherShouldHaltAfterIntegrityError,
  watcherHaltMeta,
} from "../src/state/watcher.ts";
import { commitWatcherStatesBatch, handleWatcherLogs } from "../src/state/watcher_state_ops.ts";
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
            nextBlock: 100,
            data: { logs: [] },
          };
        },
      },
      baseQuery,
    ),
  /stalled at 100 without archive height/,
  "missing archive height should not let a stalled historical cursor look terminal",
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
  () => watcherCheckpointFromNextBlock(301, 300, null),
  /stalled at 301 without archive height/,
  "watcher should reject stalled cursors when HyperSync omits archive height",
);

assert.throws(
  () => watcherCheckpointFromNextBlock(301, 300, 350),
  /stalled at 301 before archive height 350/,
  "watcher should reject stalled cursors when HyperSync indicates more historical data is still available",
);

assert.deepEqual(
  watcherProgressMeta(402, 400, 500, 0, { archiveHeights: [500, 503] }),
  {
    requestedFromBlock: 401,
    nextBlock: 402,
    archiveHeight: 500,
    checkpointBlock: 401,
    advancedBlocks: 1,
    hadLogs: false,
    caughtUp: false,
    waitReason: "empty_poll",
    constrainedBySlowestShardArchiveHeight: true,
    shardArchiveHeights: [500, 503],
  },
  "watcher progress metadata should explain why a poll advanced slowly and why it will idle",
);

assert.deepEqual(
  watcherErrorBackoffMeta(new Error("boom"), 3, 20_000, 777, "transient"),
  {
    error: "boom",
    errorName: "Error",
    errorCategory: "transient",
    consecutivePollErrors: 3,
    backoffMs: 20_000,
    currentLastBlock: 777,
  },
  "watcher error backoff metadata should capture retry context for poll failures",
);

assert.equal(
  classifyWatcherPollError(new Error("HyperSync nextBlock cursor stalled at 301 without archive height; cannot advance watcher safely.")),
  "integrity",
  "watcher should classify cursor-shape safety faults as integrity errors",
);
assert.equal(
  classifyWatcherPollError(new Error("socket hang up")),
  "transient",
  "watcher should keep ordinary transport failures in the transient retry bucket",
);
assert.equal(
  watcherErrorBackoffMs(new Error("socket hang up"), 1),
  5_000,
  "transient watcher failures should start with the base retry interval",
);
assert.equal(
  watcherErrorBackoffMs(new Error("socket hang up"), 3),
  20_000,
  "transient watcher failures should back off exponentially across consecutive attempts",
);
assert.equal(
  watcherErrorBackoffMs(new Error("Watcher shard responses returned mismatched rollback guards; refusing to merge inconsistent chain views."), 3),
  15_000,
  "integrity watcher failures should use a slower fixed cooldown instead of exponential transport backoff",
);
assert.equal(
  watcherShouldHaltAfterIntegrityError(2),
  false,
  "watcher should tolerate a bounded number of consecutive integrity failures before halting",
);
assert.equal(
  watcherShouldHaltAfterIntegrityError(3),
  true,
  "watcher should fail closed once the integrity error threshold is reached",
);
assert.deepEqual(
  watcherHaltMeta(new Error("fatal cursor invariant"), 3, 3, 400),
  {
    reason: "fatal cursor invariant",
    errorName: "Error",
    consecutiveIntegrityPollErrors: 3,
    haltThreshold: 3,
    currentLastBlock: 400,
  },
  "watcher halt metadata should preserve the shutdown reason and threshold context",
);

assert.deepEqual(
  watcherReorgMeta(501, { poolsRemoved: 2, statesRemoved: 7 }, ["0xa", "0xb", "0xc"], 500),
  {
    reorgBlock: 501,
    checkpointBlock: 500,
    poolsRemoved: 2,
    statesRemoved: 7,
    cacheEntriesReloaded: 3,
  },
  "watcher reorg metadata should summarize rewind scope and cache reload footprint",
);

{
  const cache = new Map();
  const persisted: any[] = [];
  const changed = commitWatcherStatesBatch(
    cache,
    (states: any[]) => persisted.push(...states),
    [
      {
        addr: "0x1111111111111111111111111111111111111111",
        rawLog: { blockNumber: 401 },
        state: {
          poolId: "0x1111111111111111111111111111111111111111",
          protocol: "UNISWAP_V2",
          token0: "0x2222222222222222222222222222222222222222",
          token1: "0x3333333333333333333333333333333333333333",
          tokens: [
            "0x2222222222222222222222222222222222222222",
            "0x3333333333333333333333333333333333333333",
          ],
          reserve0: 11n,
          reserve1: 12n,
          fee: 997n,
          timestamp: 0,
        },
      },
    ],
  );

  assert.deepEqual(
    changed,
    ["0x1111111111111111111111111111111111111111"],
    "watcher batch commit should accept placeholder states once it stamps a fresh commit timestamp",
  );
  assert.equal(persisted.length, 1, "watcher batch commit should persist valid state updates");
  assert.ok(
    Number(cache.get("0x1111111111111111111111111111111111111111")?.timestamp) > 0,
    "watcher batch commit should replace placeholder timestamps before validation",
  );
}

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
  const watcher = new StateWatcher(registry as any, new Map() as any) as any;

  watcher._lastBlock = 400;
  watcher._watchedAddresses = [
    "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    " 0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB ",
    "not-an-address",
    "",
  ];

  const queries = watcher._buildQueries();
  assert.equal(queries.length, 1, "watcher should not create extra query shards from duplicate or invalid addresses");
  assert.deepEqual(
    queries[0].logs,
    [
      {
        address: [
          "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        ],
        topics: [Object.values(WATCHER_TOPIC0)],
      },
    ],
    "watcher query filters should lowercase, dedupe, and drop invalid watched addresses before sharding",
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
  let callCount = 0;

  watcher._decoder = { decodeLogs: async () => [] };
  client.get = async () => {
    callCount++;
    return {
      rollbackGuard: callCount === 1
        ? { first_block_number: 400, first_parent_hash: "0xabc" }
        : { first_block_number: 400, first_parent_hash: "0xdef" },
      archiveHeight: 500,
      nextBlock: 402,
      data: { logs: [] },
    };
  };

  try {
    watcher._lastBlock = 400;
    watcher._running = true;
    watcher._watchedAddresses = Array.from(cache.keys());
    watcher._watchedAddressSet = new Set(watcher._watchedAddresses);
    await assert.rejects(
      () => watcher._pollOnce(),
      /mismatched rollback guards/,
      "watcher should reject shard responses that disagree on rollback guard identity",
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
  const cache = new Map(
    Array.from({ length: 17_000 }, (_, i) => [
      `0x${String(i + 1).padStart(40, "0")}`,
      { poolId: i + 1 },
    ]),
  );

  const watcher = new StateWatcher(registry as any, cache as any) as any;
  const originalGet = client.get;
  const originalDecoder = watcher._decoder;
  let callCount = 0;

  watcher._decoder = { decodeLogs: async () => [] };
  client.get = async () => {
    callCount++;
    return callCount === 1
      ? {
          rollbackGuard: { first_block_number: 400, first_parent_hash: "0xabc" },
          archiveHeight: 500,
          nextBlock: 402,
          data: { logs: [] },
        }
      : {
          rollbackGuard: { first_block_number: 400, first_parent_hash: "0xabc" },
          archiveHeight: 500,
          nextBlock: null,
          data: { logs: [] },
        };
  };

  try {
    watcher._lastBlock = 400;
    watcher._running = true;
    watcher._watchedAddresses = Array.from(cache.keys());
    watcher._watchedAddressSet = new Set(watcher._watchedAddresses);
    await assert.rejects(
      () => watcher._pollOnce(),
      /did not include a finite nextBlock cursor/,
      "watcher should reject shard responses that omit the authoritative nextBlock cursor",
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
  const watcher = new StateWatcher(registry as any, new Map() as any) as any;
  const originalError = watcherLogger.error;
  const originalInfo = watcherLogger.info;
  const errorCalls: any[] = [];
  const infoCalls: any[] = [];
  let pollCount = 0;

  watcherLogger.error = (...args: any[]) => {
    errorCalls.push(args);
  };
  watcherLogger.info = (...args: any[]) => {
    infoCalls.push(args);
  };
  watcher._pollOnce = async () => {
    pollCount++;
    if (pollCount <= 2) {
      throw new Error(`boom-${pollCount}`);
    }
    return {
      rollbackGuard: null,
      data: { logs: [] },
      nextBlock: 402,
      archiveHeight: 500,
      shardSummary: { archiveHeights: [500] },
    };
  };
  watcher._handleLogs = async () => new Set();
  watcher._sleep = async () => {
    if (pollCount >= 3) {
      watcher._running = false;
    }
  };

  try {
    watcher._running = true;
    watcher._lastBlock = 400;
    await watcher._loop();
    assert.deepEqual(
      errorCalls.map((args) => args[0]),
      [
        {
          error: "boom-1",
          errorName: "Error",
          errorCategory: "transient",
          consecutivePollErrors: 1,
          consecutiveIntegrityPollErrors: 0,
          backoffMs: 5_000,
          currentLastBlock: 400,
        },
        {
          error: "boom-2",
          errorName: "Error",
          errorCategory: "transient",
          consecutivePollErrors: 2,
          consecutiveIntegrityPollErrors: 0,
          backoffMs: 10_000,
          currentLastBlock: 400,
        },
      ],
      "watcher loop should log structured transient retry metadata with exponential backoff growth",
    );
    const recoveryCall = infoCalls.find((args) => args[1] === "Watcher poll recovered after errors");
    assert.deepEqual(
      recoveryCall?.[0],
      { consecutivePollErrors: 2, consecutiveIntegrityPollErrors: 0, resumedFromBlock: 401 },
      "watcher should log recovery after a successful poll following consecutive failures",
    );
  } finally {
    watcherLogger.error = originalError;
    watcherLogger.info = originalInfo;
  }
}

{
  const registry = {
    getCheckpoint: () => null,
    setCheckpoint: () => {},
    setRollbackGuard: () => {},
    rollbackToBlock: () => ({ poolsRemoved: 0, statesRemoved: 0 }),
  };
  const watcher = new StateWatcher(registry as any, new Map() as any) as any;
  const originalError = watcherLogger.error;
  const errorCalls: any[] = [];
  const slept: number[] = [];
  let pollCount = 0;

  watcherLogger.error = (...args: any[]) => {
    errorCalls.push(args);
  };
  watcher._pollOnce = async () => {
    pollCount++;
    if (pollCount === 1) {
      throw new Error("Watcher shard responses returned mismatched rollback guards; refusing to merge inconsistent chain views.");
    }
    watcher._running = false;
    return null;
  };
  watcher._sleep = async (ms: number) => {
    slept.push(ms);
  };

  try {
    watcher._running = true;
    watcher._lastBlock = 400;
    await watcher._loop();
    assert.deepEqual(
      errorCalls.map((args) => args[0]),
      [
        {
          error: "Watcher shard responses returned mismatched rollback guards; refusing to merge inconsistent chain views.",
          errorName: "Error",
          errorCategory: "integrity",
          consecutivePollErrors: 1,
          consecutiveIntegrityPollErrors: 1,
          backoffMs: 15_000,
          currentLastBlock: 400,
        },
      ],
      "watcher loop should classify rollback-guard mismatches as integrity failures",
    );
    assert.deepEqual(
      slept,
      [15_000],
      "integrity watcher failures should use the slower fixed cooldown",
    );
  } finally {
    watcherLogger.error = originalError;
  }
}

{
  const registry = {
    getCheckpoint: () => null,
    setCheckpoint: () => {},
    setRollbackGuard: () => {},
    rollbackToBlock: () => ({ poolsRemoved: 0, statesRemoved: 0 }),
  };
  const watcher = new StateWatcher(registry as any, new Map() as any) as any;
  const originalError = watcherLogger.error;
  const errorCalls: any[] = [];
  const slept: number[] = [];
  let pollCount = 0;
  let haltPayload: any = null;

  watcherLogger.error = (...args: any[]) => {
    errorCalls.push(args);
  };
  watcher._pollOnce = async () => {
    pollCount++;
    throw new Error("Watcher shard responses returned mismatched rollback guards; refusing to merge inconsistent chain views.");
  };
  watcher._sleep = async (ms: number) => {
    slept.push(ms);
  };
  watcher.onHalt = (payload: any) => {
    haltPayload = payload;
  };

  try {
    watcher._running = true;
    watcher._lastBlock = 400;
    await watcher._loop();
    assert.equal(watcher._running, false, "watcher should stop after repeated integrity failures");
    assert.equal(watcher._closed, true, "watcher should mark itself closed when halting on integrity failures");
    assert.deepEqual(
      errorCalls.map((args) => args[0]),
      [
        {
          error: "Watcher shard responses returned mismatched rollback guards; refusing to merge inconsistent chain views.",
          errorName: "Error",
          errorCategory: "integrity",
          consecutivePollErrors: 1,
          consecutiveIntegrityPollErrors: 1,
          backoffMs: 15_000,
          currentLastBlock: 400,
        },
        {
          error: "Watcher shard responses returned mismatched rollback guards; refusing to merge inconsistent chain views.",
          errorName: "Error",
          errorCategory: "integrity",
          consecutivePollErrors: 2,
          consecutiveIntegrityPollErrors: 2,
          backoffMs: 15_000,
          currentLastBlock: 400,
        },
        {
          error: "Watcher shard responses returned mismatched rollback guards; refusing to merge inconsistent chain views.",
          errorName: "Error",
          errorCategory: "integrity",
          consecutivePollErrors: 3,
          consecutiveIntegrityPollErrors: 3,
          backoffMs: 15_000,
          currentLastBlock: 400,
        },
        {
          reason: "Watcher shard responses returned mismatched rollback guards; refusing to merge inconsistent chain views.",
          errorName: "Error",
          consecutiveIntegrityPollErrors: 3,
          haltThreshold: 3,
          currentLastBlock: 400,
        },
      ],
      "watcher should halt and emit a dedicated shutdown log once repeated integrity failures cross the threshold",
    );
    assert.deepEqual(
      haltPayload,
      {
        reason: "Watcher shard responses returned mismatched rollback guards; refusing to merge inconsistent chain views.",
        errorName: "Error",
        consecutiveIntegrityPollErrors: 3,
        haltThreshold: 3,
        currentLastBlock: 400,
      },
      "watcher should publish halt metadata to supervisors when it fails closed",
    );
    assert.deepEqual(
      watcher.haltMeta,
      haltPayload,
      "watcher should retain the final halt metadata for callers that wait on the loop",
    );
    assert.deepEqual(
      slept,
      [15_000, 15_000],
      "watcher should only sleep between integrity failures until the halt threshold is reached",
    );
  } finally {
    watcherLogger.error = originalError;
  }
}

{
  const checkpointWrites: number[] = [];
  const registry = {
    getCheckpoint: () => null,
    setCheckpoint: (_key: string, block: number) => {
      checkpointWrites.push(block);
    },
    setRollbackGuard: () => {},
    rollbackToBlock: () => ({ poolsRemoved: 0, statesRemoved: 0 }),
  };
  const watcher = new StateWatcher(registry as any, new Map() as any) as any;
  const originalInfo = watcherLogger.info;
  const infoCalls: any[] = [];

  watcherLogger.info = (...args: any[]) => {
    infoCalls.push(args);
  };
  watcher._pollOnce = async () => ({
    rollbackGuard: null,
    data: { logs: [] },
    nextBlock: 402,
    archiveHeight: 500,
    shardSummary: { archiveHeights: [500, 503] },
  });
  watcher._handleLogs = async () => new Set();
  watcher._sleep = async () => {
    watcher._running = false;
  };

  try {
    watcher._running = true;
    watcher._lastBlock = 400;
    await watcher._loop();
    assert.deepEqual(checkpointWrites, [401], "watcher loop should persist the derived checkpoint block");
    const progressCall = infoCalls.find((args) => args[1] === "Watcher poll progress");
    assert.ok(progressCall, "watcher loop should emit a structured poll-progress log when it advances");
    assert.deepEqual(
      progressCall[0],
      {
        requestedFromBlock: 401,
        nextBlock: 402,
        archiveHeight: 500,
        checkpointBlock: 401,
        advancedBlocks: 1,
        hadLogs: false,
        caughtUp: false,
        waitReason: "empty_poll",
        constrainedBySlowestShardArchiveHeight: true,
        shardArchiveHeights: [500, 503],
      },
      "watcher progress logs should carry the same structured reason fields used for checkpoint observability",
    );
  } finally {
    watcherLogger.info = originalInfo;
  }
}

{
  const checkpointWrites: number[] = [];
  let rollbackGuardWritten: any = null;
  const registry = {
    getCheckpoint: () => null,
    getRollbackGuard: () => ({ block_number: 501, block_hash: "0xold-parent" }),
    setCheckpoint: (_key: string, block: number) => {
      checkpointWrites.push(block);
    },
    setRollbackGuard: (guard: any) => {
      rollbackGuardWritten = guard;
    },
    rollbackToBlock: () => ({ poolsRemoved: 2, statesRemoved: 7 }),
  };
  const watcher = new StateWatcher(registry as any, new Map() as any) as any;
  const originalWarn = watcherLogger.warn;
  const warnCalls: any[] = [];
  let pollCount = 0;
  let onReorgPayload: any = null;

  watcherLogger.warn = (...args: any[]) => {
    warnCalls.push(args);
  };
  watcher._pollOnce = async () => {
    pollCount++;
    if (pollCount === 1) {
      return {
        rollbackGuard: { first_block_number: 501, first_parent_hash: "0xnew-parent" },
        data: { logs: [] },
        nextBlock: 0,
        archiveHeight: 0,
        shardSummary: { archiveHeights: [0] },
      };
    }
    watcher._running = false;
    return null;
  };
  watcher._reloadCacheFromRegistry = () => ["0xa", "0xb", "0xc"];
  watcher.onReorg = (payload: any) => {
    onReorgPayload = payload;
  };

  try {
    watcher._running = true;
    watcher._lastBlock = 550;
    await watcher._loop();
    assert.deepEqual(checkpointWrites, [500], "watcher should checkpoint to the rewound block after a detected reorg");
    assert.deepEqual(
      rollbackGuardWritten,
      { first_block_number: 501, first_parent_hash: "0xnew-parent" },
      "watcher should persist the new rollback guard after handling a reorg",
    );
    const summaryCall = warnCalls.find((args) => args[1] === "Watcher reorg rollback summary");
    assert.deepEqual(
      summaryCall?.[0],
      {
        reorgBlock: 501,
        checkpointBlock: 500,
        poolsRemoved: 2,
        statesRemoved: 7,
        cacheEntriesReloaded: 3,
      },
      "watcher should log a compact structured rollback summary after reorg handling",
    );
    assert.deepEqual(
      onReorgPayload,
      { reorgBlock: 501, changedAddrs: ["0xa", "0xb", "0xc"] },
      "watcher should pass the reorg payload through after cache reload",
    );
  } finally {
    watcherLogger.warn = originalWarn;
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
  const cache = new Map(
    Array.from({ length: 17_000 }, (_, i) => [
      `0x${String(i + 1).padStart(40, "0")}`,
      { poolId: i + 1 },
    ]),
  );

  const watcher = new StateWatcher(registry as any, cache as any) as any;
  const originalGet = client.get;
  const originalDecoder = watcher._decoder;
  const originalWarn = watcherLogger.warn;
  const warned: any[] = [];
  let callCount = 0;

  watcher._decoder = { decodeLogs: async () => [] };
  watcherLogger.warn = (...args: any[]) => {
    warned.push(args);
  };
  client.get = async () => {
    callCount++;
    return {
      rollbackGuard: { first_block_number: 400, first_parent_hash: "0xabc" },
      archiveHeight: callCount === 1 ? 503 : 500,
      nextBlock: 402,
      data: { logs: [] },
    };
  };

  try {
    watcher._lastBlock = 400;
    watcher._running = true;
    watcher._watchedAddresses = Array.from(cache.keys());
    watcher._watchedAddressSet = new Set(watcher._watchedAddresses);
    const res = await watcher._pollOnce();
    assert.equal(res.archiveHeight, 500, "watcher should still use the slowest shard archive height");
    assert.equal(warned.length, 1, "watcher should surface archive-height drift across shards");
  } finally {
    client.get = originalGet;
    watcher._decoder = originalDecoder;
    watcherLogger.warn = originalWarn;
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
