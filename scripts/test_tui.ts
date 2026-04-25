import assert from "node:assert/strict";

import { __tuiTest } from "../src/tui/index.tsx";
import type { BotState } from "../src/tui/types.ts";

const state: BotState = {
  status: "running",
  passCount: 12,
  consecutiveErrors: 0,
  gasPrice: "31.25",
  maticPrice: "0.72",
  lastArbMs: new Date("2026-04-25T12:34:56Z").getTime(),
  opportunities: [
    {
      Route: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa -> 0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb -> 0xcccccccccccccccccccccccccccccccccccccccc",
      Profit: "123.456789 USDC",
      ROI: "1.2345%",
    },
  ],
  logs: [
    "[DEBUG] candidate_optimization_summary candidates=50 top=10 assessed=9 rejected=8 topReject=net profit 1 < minimum 2:8 | pass details",
    "[WARN] fast_revalidate_summary missingRates=2 topReject=gas cost exceeds net profit:3 | lagging behind",
  ],
};

const signature = __tuiTest.signatureFor(state, 100);
assert.equal(signature, __tuiTest.signatureFor(state, 100));
assert.notEqual(signature, __tuiTest.signatureFor({ ...state, passCount: 13 }, 100));
assert.notEqual(signature, __tuiTest.signatureFor({ ...state, lastArbMs: state.lastArbMs + 1000 }, 100));
assert.notEqual(signature, __tuiTest.signatureFor(state, 101));

const narrowFrame = __tuiTest.renderFrame(state, 60, "-");
const visibleLines = narrowFrame
  .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "")
  .split("\n");

assert.ok(visibleLines.length > 5);
assert.ok(visibleLines.some((line) => line.includes("last")));
for (const line of visibleLines) {
  assert.ok(line.length <= 72, `line exceeded minimum TUI width: ${line}`);
}

const formattedLogs = __tuiTest.formatLogs(state, 160);
assert.equal(formattedLogs.length, 2);
assert.match(formattedLogs[0], /\u001b\[/, "logs should keep severity color");
assert.match(formattedLogs[0], /topReject=net_profit/, "net-profit reject reasons should scan as one field");

assert.equal(__tuiTest.formatLastPass(0), "never");
assert.match(__tuiTest.formatLastPass(state.lastArbMs), /^\d{2}:\d{2}:\d{2}$/);

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
