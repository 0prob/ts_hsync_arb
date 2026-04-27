import assert from "node:assert/strict";

import { client } from "../src/hypersync/client.ts";
import {
  classifyWatcherPollError,
  StateWatcher,
  WATCHER_TOPIC0,
  dedupeWatcherLogs,
  sortWatcherLogs,
  watcherCheckpointFromNextBlock,
  watcherErrorBackoffMeta,
  watcherProgressMeta,
  watcherShardArchiveHeightMeta,
} from "../src/state/watcher.ts";
import {
  HYPERSYNC_MAX_ADDRESS_FILTER,
  HYPERSYNC_MAX_FILTERS_PER_REQUEST,
} from "../src/config/index.ts";
import { commitWatcherStatesBatch, handleWatcherLogs, toTopicArray } from "../src/state/watcher_state_ops.ts";

function address(index: number) {
  return `0x${index.toString(16).padStart(40, "0")}`;
}

{
  assert.deepEqual(
    toTopicArray({
      topics: [["  0x" + "Aa".repeat(32) + "  "], null, "0x" + "Bb".repeat(32)],
      topic0: "0x" + "Cc".repeat(32),
    }),
    ["0x" + "aa".repeat(32), "0x" + "bb".repeat(32)],
    "watcher topic extraction should normalize HyperSync topic fields before dispatch",
  );
}

{
  const poolA = address(101);
  const poolB = address(102);
  const logs = [
    { address: poolB, blockNumber: 12, transactionIndex: 0, logIndex: 0 },
    { address: poolA, blockNumber: 10, transactionIndex: 1, logIndex: 2 },
    { address: poolA.toUpperCase(), blockNumber: 10, transactionIndex: 1, logIndex: 1 },
  ];
  assert.deepEqual(
    sortWatcherLogs(logs).map((log) => log.logIndex),
    [1, 2, 0],
    "watcher log sorting should use normalized numeric HyperSync log fields",
  );

  assert.deepEqual(
    dedupeWatcherLogs([
      { transactionHash: "0xABC", logIndex: "7", blockNumber: 1 },
      { transactionHash: "0xabc", logIndex: 7, blockNumber: 2 },
      { address: poolA.toUpperCase(), blockNumber: 3, transactionIndex: 1, logIndex: 1 },
      { address: poolA, blockNumber: 3, transactionIndex: 1, logIndex: 1 },
    ]).map((log) => log.blockNumber),
    [1, 3],
    "watcher log dedupe should treat mixed-case tx and pool addresses as identical",
  );
}

{
  const meta = watcherShardArchiveHeightMeta([86013270, 86013271, 86013272]);
  assert.deepEqual(meta.archiveHeights, [86013270, 86013271, 86013272]);
  assert.equal(meta.archiveHeightSpread, 2);
  assert.equal(meta.logLevel, "debug");
}

{
  const meta = watcherShardArchiveHeightMeta([86013270, 86013310]);
  assert.equal(meta.archiveHeightSpread, 40);
  assert.equal(meta.logLevel, "warn");
}

{
  const err: any = new Error("Watcher shard request failed (shard 1: V3: invalid fee)");
  err.name = "WatcherShardRequestError";
  err.shardFailures = [{ shardIndex: 1, errorName: "Error", error: "V3: invalid fee" }];
  assert.equal(classifyWatcherPollError(err), "transient");
  assert.deepEqual(
    watcherErrorBackoffMeta(err, 2, 10_000, 123, "transient").shardFailures,
    err.shardFailures,
  );
}

{
  const err: any = new Error("watcher state integrity failed for 0xabc: invalid timestamp");
  err.name = "WatcherStateIntegrityError";
  err.poolAddress = "0xabc";
  err.validationReason = "invalid timestamp";
  err.blockNumber = 123;
  assert.equal(classifyWatcherPollError(err), "integrity");
  assert.deepEqual(
    {
      poolAddress: watcherErrorBackoffMeta(err, 1, 15_000, 122, "integrity").poolAddress,
      validationReason: watcherErrorBackoffMeta(err, 1, 15_000, 122, "integrity").validationReason,
      blockNumber: watcherErrorBackoffMeta(err, 1, 15_000, 122, "integrity").blockNumber,
    },
    {
      poolAddress: "0xabc",
      validationReason: "invalid timestamp",
      blockNumber: 123,
    },
  );
}

assert.equal(
  watcherCheckpointFromNextBlock("101", "99", "101"),
  100,
  "watcher checkpoint math should accept integer block cursors encoded as strings",
);
assert.throws(
  () => watcherCheckpointFromNextBlock(100.5, 99, 101),
  /finite nextBlock cursor/,
  "watcher checkpoint math should reject fractional nextBlock cursors",
);
assert.throws(
  () => watcherCheckpointFromNextBlock(101, 99.5, 101),
  /currentLastBlock must be a finite non-negative safe integer/,
  "watcher checkpoint math should reject fractional current checkpoint blocks",
);
assert.throws(
  () => watcherProgressMeta(101, 99, "bad-height", 0),
  /archiveHeight must be a finite non-negative safe integer/,
  "watcher progress metadata should reject malformed archive heights instead of treating them as caught-up state",
);
assert.deepEqual(
  watcherProgressMeta("101", "99", "101", 0),
  {
    requestedFromBlock: 100,
    nextBlock: 101,
    archiveHeight: 101,
    checkpointBlock: 100,
    advancedBlocks: 1,
    hadLogs: false,
    caughtUp: true,
    waitReason: "empty_poll",
    constrainedBySlowestShardArchiveHeight: false,
    shardArchiveHeights: null,
  },
  "watcher progress metadata should normalize integer string block cursors consistently",
);

{
  const originalGet = client.get;
  const cache = new Map();
  for (let i = 1; i <= 8001; i++) {
    cache.set(address(i), {});
  }

  const watcher: any = new StateWatcher({}, cache);
  watcher._lastBlock = 99;
  watcher._running = true;
  watcher._sleep = async () => {};

  let callCount = 0;
  client.get = async () => {
    callCount += 1;
    if (callCount === 1) {
      throw new Error("temporary shard transport failure");
    }
    return {
      nextBlock: 101,
      archiveHeight: 101,
      rollbackGuard: null,
      data: { logs: [] },
    };
  };

  try {
    const result = await watcher._pollOnce();
    assert.equal(result.nextBlock, 101);
    assert.equal(result.archiveHeight, 101);
    assert.equal(result.data.logs.length, 0);
    assert.equal(callCount, 2);
  } finally {
    client.get = originalGet;
  }
}

{
  const originalGet = client.get;
  const cache = new Map();
  const addressCount = HYPERSYNC_MAX_ADDRESS_FILTER * HYPERSYNC_MAX_FILTERS_PER_REQUEST + 1;
  for (let i = 1; i <= addressCount; i++) {
    cache.set(address(i), {});
  }

  const watcher: any = new StateWatcher({}, cache);
  watcher._lastBlock = 99;
  watcher._running = true;
  watcher._sleep = async () => {};
  watcher._watchedAddresses = [...cache.keys()];
  watcher._watchedAddressSet = new Set(watcher._watchedAddresses);
  assert.ok(watcher._buildQueries().length > 1, "test fixture should force multiple watcher shard requests");

  let callCount = 0;
  client.get = async () => {
    callCount += 1;
    if (callCount === 1) {
      return {
        nextBlock: 102,
        archiveHeight: 102,
        rollbackGuard: {
          blockNumber: 101,
          hash: "0x" + "11".repeat(32),
          firstBlockNumber: 91,
          firstParentHash: "0x" + "aa".repeat(32),
        },
        data: {
          logs: [
            {
              address: address(1),
              blockNumber: 100,
              transactionHash: "0x" + "01".repeat(32),
              transactionIndex: 0,
              logIndex: 0,
            },
            {
              address: address(1),
              blockNumber: 101,
              transactionHash: "0x" + "02".repeat(32),
              transactionIndex: 0,
              logIndex: 1,
            },
          ],
        },
      };
    }
    return {
      nextBlock: 101,
      archiveHeight: 101,
      rollbackGuard: {
        blockNumber: 100,
        hash: "0x" + "22".repeat(32),
        firstBlockNumber: 90,
        firstParentHash: "0x" + "bb".repeat(32),
      },
      data: {
        logs: [
          {
            address: address(2),
            blockNumber: 100,
            transactionHash: "0x" + "03".repeat(32),
            transactionIndex: 0,
            logIndex: 2,
          },
        ],
      },
    };
  };

  try {
    const result = await watcher._pollOnce();
    assert.equal(result.nextBlock, 101);
    assert.equal(result.archiveHeight, 101);
    assert.equal(result.rollbackGuard.block_number, 100);
    assert.equal(result.rollbackGuard.hash, "0x" + "22".repeat(32));
    assert.equal(result.rollbackGuard.first_block_number, 90);
    assert.deepEqual(
      result.data.logs.map((log: any) => log.blockNumber),
      [100, 100],
      "watcher should defer logs beyond the slowest shard cursor",
    );
  } finally {
    client.get = originalGet;
  }
}

{
  const originalGet = client.get;
  const cache = new Map([[address(1), {}]]);
  const watcher: any = new StateWatcher({}, cache);
  watcher._lastBlock = 99;
  watcher._running = true;
  watcher._sleep = async () => {};

  client.get = async () => ({
    nextBlock: 100.5,
    archiveHeight: 101,
    rollbackGuard: null,
    data: { logs: [] },
  });

  try {
    await assert.rejects(
      () => watcher._pollOnce(),
      /did not include a finite nextBlock cursor/,
      "watcher shard merge should reject fractional nextBlock cursors",
    );
  } finally {
    client.get = originalGet;
  }
}

{
  const poolAddress = address(70);
  const cache = new Map([
    [
      poolAddress,
      {
        poolId: poolAddress,
        protocol: "UNISWAP_V3",
        tokens: [address(71), address(72)],
        timestamp: 0,
      },
    ],
  ]);
  const enqueued: string[] = [];
  const changed = await handleWatcherLogs({
    logs: [
      {
        address: poolAddress,
        blockNumber: 85949561,
        transactionHash: "0x104052732cf4c3a99906b3d0ef116b53bbc5346139409babbd5670339d8f7564",
        topic0: WATCHER_TOPIC0.V3_BURN,
      },
    ],
    decoded: [{ indexed: [], body: [] }],
    registry: {
      getPoolMeta(addr: string) {
        assert.equal(addr, poolAddress);
        return {
          pool_address: poolAddress,
          protocol: "UNISWAP_V3",
          tokens: [address(71), address(72)],
          metadata: { fee: "3000", tickSpacing: "60" },
        };
      },
    },
    cache,
    closed: () => false,
    topic0: WATCHER_TOPIC0,
    refreshBalancer: () => {},
    refreshCurve: () => {},
    refreshV3: () => {},
    enqueueEnrichment: (addr: string) => {
      enqueued.push(addr);
    },
    commitStates: () => {
      throw new Error("cold V3 liquidity events should refresh state instead of committing placeholders");
    },
  });

  assert.deepEqual([...changed], []);
  assert.deepEqual(enqueued, [poolAddress]);
}

{
  const poolAddress = address(80);
  const watcher: any = new StateWatcher({}, new Map());
  let attempts = 0;
  await watcher._enqueueEnrichment(poolAddress, async () => {
    attempts++;
    throw new Error("temporary V3 refresh failure");
  });

  assert.equal(attempts, 1);
  const retryState = watcher._enrichmentRetryState.get(poolAddress);
  assert.equal(retryState.attempts, 1);
  assert.match(retryState.lastReason, /temporary V3 refresh failure/);

  await watcher._enqueueEnrichment(poolAddress, async () => {
    attempts++;
  });
  assert.equal(attempts, 1, "enrichment cooldown should suppress immediate duplicate retries");

  retryState.nextRetryAt = Date.now() - 1;
  await watcher._enqueueEnrichment(poolAddress, async () => {
    attempts++;
  });
  assert.equal(attempts, 2);
  assert.equal(watcher._enrichmentRetryState.has(poolAddress), false);
}

{
  const cache = new Map();
  const persisted: any[] = [];
  const v3State = {
    poolId: address(50),
    protocol: "UNISWAP_V3",
    token0: address(51),
    token1: address(52),
    tokens: [address(51), address(52)],
    sqrtPriceX96: 79228162514264337593543950336n,
    tick: 0,
    liquidity: 0n,
    tickSpacing: 60,
    ticks: new Map(),
    initialized: true,
    fee: 3000n,
    timestamp: 0,
  };

  assert.deepEqual(
    commitWatcherStatesBatch(
      cache,
      (states: any[]) => persisted.push(...states),
      [
        {
          addr: address(50),
          rawLog: { blockNumber: 654, transactionHash: "0xtx", topic0: "0xtopic" },
          state: v3State,
        },
      ],
    ),
    [address(50)],
    "watcher should advance through V3 events whose post-event active liquidity is zero",
  );
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].block, 654);
  assert.equal(cache.get(address(50)).liquidity, 0n);
}

{
  const cache = new Map();
  const persisted: any[] = [];
  const pool = address(60);
  const baseToken = address(61);
  const quoteToken = address(62);
  const dodoState = {
    poolId: pool,
    protocol: "DODO_DVM",
    token0: baseToken,
    token1: quoteToken,
    tokens: [baseToken, quoteToken],
    baseToken,
    quoteToken,
    baseReserve: 1_000n,
    quoteReserve: 1_000n,
    baseTarget: 0n,
    quoteTarget: 0n,
    i: 1n,
    k: 0n,
    rState: 0,
    lpFeeRate: 0n,
    mtFeeRate: 0n,
    timestamp: 0,
  };

  assert.deepEqual(
    commitWatcherStatesBatch(
      cache,
      (states: any[]) => persisted.push(...states),
      [
        {
          addr: pool,
          rawLog: { blockNumber: 86088757, transactionHash: "0xtx", topic0: WATCHER_TOPIC0.DODO_SWAP },
          state: dodoState,
        },
      ],
    ),
    [pool],
    "watcher should advance through observed DODO states whose PMM targets are zero",
  );
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].block, 86088757);
  assert.equal(cache.get(pool).baseTarget, 0n);
}

{
  const cache = new Map();
  const pool = address(63);
  const baseToken = address(64);
  const quoteToken = address(65);
  assert.throws(
    () =>
      commitWatcherStatesBatch(cache, () => {}, [
        {
          addr: pool,
          rawLog: { blockNumber: 86088758, transactionHash: "0xtx", topic0: WATCHER_TOPIC0.DODO_SWAP },
          state: {
            poolId: pool,
            protocol: "DODO_DVM",
            token0: baseToken,
            token1: quoteToken,
            tokens: [baseToken, quoteToken],
            baseToken,
            quoteToken,
            baseReserve: 1_000n,
            quoteReserve: 1_000n,
            baseTarget: -1n,
            quoteTarget: 1_000n,
            i: 1n,
            k: 0n,
            rState: 0,
            lpFeeRate: 0n,
            mtFeeRate: 0n,
            timestamp: 0,
          },
        },
      ]),
    (err: any) => {
      assert.equal(err.name, "WatcherStateIntegrityError");
      assert.equal(err.poolAddress, pool);
      assert.equal(err.validationReason, "DODO: zero targets");
      return true;
    },
    "watcher should still reject malformed negative DODO targets",
  );
}

{
  const cache = new Map();
  const persistStates = () => {
    throw new Error("persist should not be called for invalid watcher state");
  };
  assert.throws(
    () =>
      commitWatcherStatesBatch(cache, persistStates, [
        {
          addr: address(42),
          rawLog: { blockNumber: 321, transactionHash: "0xtx", topic0: "0xtopic" },
          state: {
            poolId: address(42),
            protocol: "UNISWAP_V2",
            tokens: [address(43)],
            timestamp: 0,
            reserve0: 1n,
            reserve1: 1n,
            fee: 3n,
          },
        },
      ]),
    (err: any) => {
      assert.equal(err.name, "WatcherStateIntegrityError");
      assert.equal(err.poolAddress, address(42));
      assert.equal(err.validationReason, "fewer than 2 tokens");
      assert.equal(err.blockNumber, 321);
      return true;
    },
    "watcher batch validation should emit structured integrity errors",
  );
}

console.log("Watcher poll checks passed.");
