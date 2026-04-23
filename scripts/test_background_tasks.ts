import assert from "node:assert/strict";

import { createBackgroundTaskTracker } from "../src/runtime/background_tasks.ts";

const tracker = createBackgroundTaskTracker();

let releaseRejectingTask: (() => void) | null = null;
const rejectingTask = tracker.track(
  (async () => {
    await new Promise<void>((resolve) => {
      releaseRejectingTask = resolve;
    });
    throw new Error("background failure");
  })(),
);

let releaseSuccessTask: (() => void) | null = null;
const successTask = tracker.track(
  new Promise<void>((resolve) => {
    releaseSuccessTask = resolve;
  }),
);

assert.equal(tracker.size(), 2, "tracker should count in-flight background promises");

const idlePromise = tracker.waitForIdle();
let idleResolved = false;
void idlePromise.then(() => {
  idleResolved = true;
});

await Promise.resolve();
assert.equal(idleResolved, false, "waitForIdle should remain pending while background work is active");

releaseRejectingTask?.();
await assert.rejects(rejectingTask, /background failure/, "tracked promises should preserve original rejection to callers");
assert.equal(tracker.size(), 1, "rejected background promises should still be removed from the tracker");

releaseSuccessTask?.();
await successTask;
await idlePromise;
assert.equal(tracker.size(), 0, "tracker should be empty once all background work settles");

console.log("Background task checks passed.");
