import assert from "node:assert/strict";
import { setImmediate as setImmediatePromise } from "node:timers/promises";

import { createArbScheduler } from "../src/bootstrap/lifecycle.ts";

const recordedChangedPools: number[] = [];
const runErrors: string[] = [];
let runCount = 0;
let running = true;

const scheduler = createArbScheduler({
  isRunning: () => running,
  recordArbActivity: (changedPools) => {
    recordedChangedPools.push(changedPools);
  },
  getAdaptiveDebounceMs: () => 0,
  runPass: async () => {
    runCount++;
    throw new Error("pass failed");
  },
  onRunError: (err) => {
    runErrors.push(err instanceof Error ? err.message : String(err));
  },
});

scheduler.scheduleArb(2.9);
await scheduler.waitForIdle();

assert.equal(runCount, 1);
assert.deepEqual(recordedChangedPools, [2]);
assert.deepEqual(runErrors, ["pass failed"]);

scheduler.scheduleArb(Number.NaN);
await scheduler.waitForIdle();

assert.equal(runCount, 2);
assert.deepEqual(recordedChangedPools, [2, 0]);
assert.deepEqual(runErrors, ["pass failed", "pass failed"]);

running = false;
scheduler.scheduleArb(5);
await setImmediatePromise();
await scheduler.waitForIdle();

assert.equal(runCount, 2, "scheduler must not run passes after runtime stop");
assert.deepEqual(recordedChangedPools, [2, 0], "stopped scheduler must not record new activity");

console.log("Coordinator checks passed.");
