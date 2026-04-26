import assert from "node:assert/strict";
import { setImmediate as setImmediatePromise } from "node:timers/promises";

import { configureWatcherCallbacks } from "../src/bootstrap/lifecycle.ts";
import {
  normalizeChangedPools,
  normalizeEventPayload,
  normalizeReorgBlock,
} from "../src/runtime/events.ts";

const poolA = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const poolB = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const poolC = "0xcccccccccccccccccccccccccccccccccccccccc";

assert.deepEqual([...normalizeChangedPools([` ${poolA.toUpperCase()} `, "", poolA, 123, "0xnotapool"])], [poolA]);
assert.deepEqual([...normalizeChangedPools(poolB.toUpperCase())], [poolB]);
assert.deepEqual([...normalizeChangedPools(null)], []);
assert.equal(normalizeReorgBlock("55"), 55);
assert.equal(normalizeReorgBlock(55.5), null);
assert.deepEqual(normalizeEventPayload("halted"), {});

const received: string[] = [];
const logs: string[] = [];
const watcher: {
  onBatch: ((changed: unknown) => void) | null;
  onReorg: ((payload: unknown) => void) | null;
  onHalt: ((payload: unknown) => void) | null;
} = {
  onBatch: null,
  onReorg: null,
  onHalt: null,
};

configureWatcherCallbacks({
  watcher,
  log: (message, _level, meta: any) => {
    logs.push(`${String(meta?.event ?? "none")}:${message}`);
  },
  onPoolsChanged: ({ changedPools }) => {
    received.push(`batch:${[...changedPools].join(",")}`);
  },
  onReorgDetected: ({ reorgBlock, changedPools }) => {
    received.push(`reorg:${reorgBlock}:${[...changedPools].join(",")}`);
  },
  onHaltDetected: ({ payload }) => {
    received.push(`halt:${String(payload.reason ?? "unknown")}`);
  },
  scheduleArb: (changedPools = 0) => {
    received.push(`schedule:${changedPools}`);
  },
});

watcher.onBatch?.([` ${poolA.toUpperCase()} `, "", poolA, 123]);
await Promise.resolve();
await setImmediatePromise();
assert.equal(
  received.join("|"),
  `batch:${poolA}|schedule:1`,
  "batch events should normalize, dedupe, and count changed pool identifiers",
);

received.length = 0;
watcher.onReorg?.({ reorgBlock: "55", changedAddrs: poolB.toUpperCase() });
await Promise.resolve();
await setImmediatePromise();
assert.equal(
  received.join("|"),
  `reorg:55:${poolB}|schedule:1`,
  "reorg events should treat a string changedAddrs payload as one pool identifier",
);

received.length = 0;
watcher.onReorg?.({ reorgBlock: 55.5, changedAddrs: [poolC] });
await Promise.resolve();
await setImmediatePromise();
assert.equal(received.join("|"), "schedule:1");
assert.match(logs.join("|"), /watcher_reorg_invalid/);

received.length = 0;
watcher.onHalt?.("halted");
await Promise.resolve();
await setImmediatePromise();
assert.equal(received.join("|"), "halt:unknown", "non-object halt payloads should not crash the event bridge");

console.log("Event bridge checks passed.");
