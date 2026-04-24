import assert from "node:assert/strict";

import { WorkerPool } from "../src/routing/worker_pool.ts";

{
  const pool = new WorkerPool(1) as any;
  pool._initialized = true;
  pool._slots = [
    {
      worker: null,
      busy: false,
      currentJobId: null,
      syncedStateVersions: new Map(),
      syncedPoolAddresses: new Set(),
      syncedTopologyKey: null,
    },
  ];

  const promise = pool._submit({ type: "EVALUATE", paths: [] });
  assert.equal(pool._queue.length, 1, "submit should queue work when the only slot has no live worker");
  assert.equal(pool._pending.size, 1, "queued work should remain tracked as pending");

  await pool.terminate();
  await assert.rejects(promise, /Worker pool terminated/, "terminate should reject queued work instead of hanging");
}

{
  const pool = new WorkerPool(2) as any;
  pool._initialized = true;
  const dispatched: any[] = [];
  pool._dispatchToSlot = (slot: any, id: number, data: any) => {
    dispatched.push({ slot, id, data });
  };
  pool._slots = [
    {
      worker: {} as any,
      busy: false,
      currentJobId: null,
      syncedStateVersions: new Map(),
      syncedPoolAddresses: new Set(),
      syncedTopologyKey: null,
      respawnTimer: null,
      startupFailures: 0,
      disabled: true,
    },
    {
      worker: {} as any,
      busy: false,
      currentJobId: null,
      syncedStateVersions: new Map(),
      syncedPoolAddresses: new Set(),
      syncedTopologyKey: null,
      respawnTimer: null,
      startupFailures: 0,
      disabled: false,
    },
  ];

  const promise = pool._submit({ type: "EVALUATE", paths: [] });
  assert.equal(dispatched.length, 1, "submit should dispatch immediately when a usable non-disabled slot exists");
  assert.equal(dispatched[0].slot, pool._slots[1], "disabled slots should not be treated as usable worker slots");
  const pending = pool._pending.get(dispatched[0].id);
  assert(pending, "dispatched work should remain tracked as pending until the worker responds");
  pending.resolve([]);
  pool._pending.delete(dispatched[0].id);
  await promise;
}

{
  const pool = new WorkerPool(1) as any;
  let rejected: Error | null = null;
  pool._pending.set(7, {
    resolve: () => {
      throw new Error("pending promise should not resolve");
    },
    reject: (error: Error) => {
      rejected = error;
    },
    slot: null,
  });

  pool._dispatchToSlot(
    {
      worker: null,
      busy: false,
      currentJobId: null,
      syncedStateVersions: new Map(),
      syncedPoolAddresses: new Set(),
      syncedTopologyKey: null,
    },
    7,
    { type: "EVALUATE", paths: [] },
  );

  assert.match(
    rejected?.message ?? "",
    /unavailable worker slot/,
    "dispatch should reject immediately when a slot has no worker",
  );
  assert.equal(pool._pending.size, 0, "failed dispatch should clear the pending entry");
}

{
  const pool = new WorkerPool(1) as any;
  const calls: any[] = [];
  pool._submitToSlot = async (_slot: any, data: any) => {
    calls.push(data);
    return [];
  };

  const slot = {
    worker: {} as any,
    busy: false,
    currentJobId: null,
    syncedStateVersions: new Map([
      ["pool-a", 5],
      ["pool-z", 9],
    ]),
    syncedPoolAddresses: new Set(["pool-a", "pool-z"]),
    syncedTopologyKey: null,
  };

  await pool._evaluateOnSlot(
    slot,
    [
      {
        startToken: "0xstart",
        hopCount: 2,
        logWeight: 0,
        edges: [
          {
            poolAddress: "pool-a",
            tokenIn: "0xa",
            tokenOut: "0xb",
            protocol: "QUICKSWAP_V2",
            zeroForOne: true,
          },
          {
            poolAddress: "pool-b",
            tokenIn: "0xb",
            tokenOut: "0xa",
            protocol: "QUICKSWAP_V2",
            zeroForOne: false,
          },
        ],
      },
    ],
    [
      {
        serialisedKey: "route-1",
        startToken: "0xstart",
        hopCount: 2,
        logWeight: 0,
        edges: [],
      },
    ],
    new Map([
      ["pool-a", { protocol: "QUICKSWAP_V2", timestamp: 5 }],
      ["pool-b", { protocol: "QUICKSWAP_V2", timestamp: 11 }],
    ]),
    "1000",
    {},
  );

  assert.equal(calls.length, 2, "slot evaluation should sync before evaluating when pool ownership changes");
  assert.equal(calls[0].type, "SYNC_STATE");
  assert.deepEqual(calls[0].retainPools, ["pool-a", "pool-b"]);
  assert.deepEqual(Object.keys(calls[0].stateObj).sort(), ["pool-b"]);
  assert.equal(calls[1].type, "EVALUATE");
  assert.deepEqual([...slot.syncedPoolAddresses].sort(), ["pool-a", "pool-b"]);
  assert.equal(slot.syncedStateVersions.get("pool-a"), 5, "existing synced versions should be retained");
  assert.equal(slot.syncedStateVersions.get("pool-b"), 11, "newly synced pools should record their version");
  assert.equal(slot.syncedStateVersions.has("pool-z"), false, "slot metadata should prune stale pools");
}

console.log("Worker pool checks passed.");
