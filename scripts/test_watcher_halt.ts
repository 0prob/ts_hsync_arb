import assert from "node:assert/strict";

import { createWatcherHaltCoordinator } from "../src/runtime/watcher_halt.ts";

{
  const events: string[] = [];
  const logs: Array<{ msg: string; meta: any }> = [];

  const coordinator = createWatcherHaltCoordinator({
    log: (msg, _level, meta) => {
      logs.push({ msg, meta });
    },
    setRunning: (running) => {
      events.push(`setRunning:${running}`);
    },
    setBotStatus: (status) => {
      events.push(`botStatus:${status}`);
    },
    cancelScheduledArb: () => {
      events.push("cancelScheduledArb");
    },
    stopHeartbeat: () => {
      events.push("stopHeartbeat");
    },
    recordWatcherHalt: (payload) => {
      events.push(`recordWatcherHalt:${String(payload.reason ?? "unknown")}`);
    },
  });

  coordinator.handleHaltDetected({
    reason: "fatal watcher fault",
    currentLastBlock: 123,
  });

  assert.deepEqual(
    events,
    [
      "setRunning:false",
      "botStatus:error",
      "cancelScheduledArb",
      "stopHeartbeat",
      "recordWatcherHalt:fatal watcher fault",
    ],
    "watcher halt recovery should stop the loop and publish metrics before returning",
  );
  assert.equal(logs.length, 1);
  assert.equal(logs[0]?.meta?.event, "watcher_halt");
  assert.equal(logs[0]?.meta?.reason, "fatal watcher fault");
}

console.log("Watcher halt checks passed.");
