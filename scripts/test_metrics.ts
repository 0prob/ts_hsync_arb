import assert from "node:assert/strict";

import {
  classifyWatcherHaltReason,
  recordWatcherHalt,
  setWatcherHealthy,
  watcherHealth,
  watcherHalts,
  watcherIntegrityErrorStreak,
  watcherLastHaltBlock,
} from "../src/utils/metrics.ts";

assert.equal(
  classifyWatcherHaltReason("Watcher shard responses returned mismatched rollback guards; refusing to merge inconsistent chain views."),
  "rollback_guard",
  "watcher halt reasons mentioning rollback guards should be bucketed together",
);
assert.equal(
  classifyWatcherHaltReason("HyperSync nextBlock cursor stalled at 301 without archive height; cannot advance watcher safely."),
  "cursor",
  "watcher halt reasons mentioning cursor safety faults should be bucketed together",
);

setWatcherHealthy();
let healthMetric = await watcherHealth.get();
let streakMetric = await watcherIntegrityErrorStreak.get();
assert.equal(healthMetric.values[0]?.value, 1, "setting watcher healthy should publish a healthy gauge");
assert.equal(streakMetric.values[0]?.value, 0, "setting watcher healthy should clear the integrity streak gauge");

const haltsBefore = await watcherHalts.get();
const rollbackBefore = haltsBefore.values.find((entry) => entry.labels?.reason_category === "rollback_guard")?.value ?? 0;

recordWatcherHalt({
  reason: "Watcher shard responses returned mismatched rollback guards; refusing to merge inconsistent chain views.",
  consecutiveIntegrityPollErrors: 3,
  currentLastBlock: 400,
});

healthMetric = await watcherHealth.get();
streakMetric = await watcherIntegrityErrorStreak.get();
const haltBlockMetric = await watcherLastHaltBlock.get();
const haltsAfter = await watcherHalts.get();
const rollbackAfter = haltsAfter.values.find((entry) => entry.labels?.reason_category === "rollback_guard")?.value ?? 0;

assert.equal(healthMetric.values[0]?.value, 0, "recording a watcher halt should publish an unhealthy watcher gauge");
assert.equal(streakMetric.values[0]?.value, 3, "recording a watcher halt should expose the integrity streak");
assert.equal(haltBlockMetric.values[0]?.value, 400, "recording a watcher halt should expose the last halt block");
assert.equal(rollbackAfter - rollbackBefore, 1, "recording a watcher halt should increment the categorized halt counter");

console.log("Metrics checks passed.");
