import assert from "node:assert/strict";

import { client } from "../src/hypersync/client.ts";
import {
  classifyWatcherPollError,
  StateWatcher,
  watcherCheckpointFromNextBlock,
  watcherErrorBackoffMeta,
  watcherProgressMeta,
  watcherShardArchiveHeightMeta,
} from "../src/state/watcher.ts";

function address(index: number) {
  return `0x${index.toString(16).padStart(40, "0")}`;
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

console.log("Watcher poll checks passed.");
