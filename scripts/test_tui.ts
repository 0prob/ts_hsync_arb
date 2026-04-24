import assert from "node:assert/strict";

import { __tuiTest } from "../src/tui/index.tsx";
import type { BotState } from "../src/tui/types.ts";

const state: BotState = {
  status: "running",
  passCount: 12,
  consecutiveErrors: 0,
  gasPrice: "31.25",
  maticPrice: "0.72",
  lastArbMs: 0,
  opportunities: [
    {
      Route: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa -> 0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb -> 0xcccccccccccccccccccccccccccccccccccccccc",
      Profit: "123.456789 USDC",
      ROI: "1.2345%",
    },
  ],
  logs: [
    "[INFO] pass_complete pass=12 opportunities=1 | this is a long line ".repeat(5),
    "[WARN] watcher_lag changed=25 | lagging behind current archive tip",
  ],
};

const signature = __tuiTest.signatureFor(state, 100);
assert.equal(signature, __tuiTest.signatureFor(state, 100));
assert.notEqual(signature, __tuiTest.signatureFor({ ...state, passCount: 13 }, 100));
assert.notEqual(signature, __tuiTest.signatureFor(state, 101));

const narrowFrame = __tuiTest.renderFrame(state, 60, "-");
const visibleLines = narrowFrame
  .replace(/\u001b\[[0-9;?]*[A-Za-z]/g, "")
  .split("\n");

assert.ok(visibleLines.length > 5);
for (const line of visibleLines) {
  assert.ok(line.length <= 72, `line exceeded minimum TUI width: ${line}`);
}

const formattedLogs = __tuiTest.formatLogs(state, 36);
assert.equal(formattedLogs.length, 2);
assert.match(formattedLogs[0], /\u001b\[/, "logs should keep severity color");

const writes: string[] = [];
const fakeStream = {
  write(chunk: unknown) {
    writes.push(String(chunk));
    return true;
  },
};

const guardedState: BotState = {
  ...state,
  logs: [],
};
const guard = __tuiTest.installOutputGuard(guardedState, [{ label: "stdout", stream: fakeStream }]);

fakeStream.write("external line one\npartial");
assert.equal(writes.length, 0, "guard should capture external stdout writes");
assert.deepEqual(guardedState.logs, ["[STDOUT] external line one"]);

guard.write(fakeStream, "tui frame");
assert.deepEqual(writes, ["tui frame"], "guard should allow renderer writes through");

guard.restore();
assert.equal(fakeStream.write("after restore"), true);
assert.deepEqual(writes, ["tui frame", "after restore"], "restore should put the original writer back");
assert.equal(guardedState.logs[0], "[STDOUT] partial", "restore should flush partial captured output");

console.log("TUI checks passed.");
