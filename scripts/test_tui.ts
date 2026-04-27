import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "ink";

import {
  Dashboard,
  formatAge,
  formatDurationMs,
  formatLastPass,
  logTone,
  normalizeLogLine,
  signalSummary,
  snapshotBotState,
} from "../src/tui/App.tsx";
import { startTui } from "../src/tui/index.tsx";
import type { BotState } from "../src/tui/types.ts";

const now = new Date("2026-04-25T12:35:06Z").getTime();
const state: BotState = {
  status: "running",
  mode: "loop-live",
  passCount: 12,
  consecutiveErrors: 0,
  gasPrice: "31.25",
  lastArbMs: new Date("2026-04-25T12:34:56Z").getTime(),
  stateCacheSize: 1234,
  cachedPathCount: 56789,
  lastPassDurationMs: 1450,
  lastOpportunityCount: 3,
  lastPathsEvaluated: 321,
  lastCandidateCount: 22,
  lastShortlistCount: 10,
  lastOptimizedCount: 7,
  lastProfitableCount: 3,
  lastUpdateMs: new Date("2026-04-25T12:35:01Z").getTime(),
  opportunities: [
    {
      Route: "UNISWAP_V3 -> QUICKSWAP_V2 -> BALANCER",
      Profit: "123.456789 USDC",
      ROI: "1.2345%",
    },
  ],
  logs: [
    "[DEBUG] candidate_optimization_summary candidates=50 top=10 assessed=9 rejected=8 topReject=net profit 1 < minimum 2:8 | pass details",
    "[WARN] fast_revalidate_summary missingRates=2 topReject=gas cost exceeds net profit:3 | lagging behind",
  ],
};

const snapshot = snapshotBotState(state);
assert.notEqual(snapshot, state);
assert.notEqual(snapshot.opportunities, state.opportunities);
assert.notEqual(snapshot.logs, state.logs);
assert.equal(snapshot.opportunities.length, 1);
assert.equal(snapshot.logs.length, 2);

assert.equal(formatLastPass(0), "never");
assert.match(formatLastPass(state.lastArbMs), /^\d{2}:\d{2}:\d{2}$/);
assert.equal(formatDurationMs(999), "999ms");
assert.equal(formatDurationMs(1450), "1.4s");
assert.equal(formatAge(state.lastUpdateMs, now), "5s ago");
assert.equal(normalizeLogLine(state.logs[0]).includes("topReject=net_profit"), true);
assert.equal(logTone("[ERROR] bad"), "red");
assert.equal(logTone("[WARN] slow"), "yellow");
assert.equal(logTone("[DEBUG] noisy"), "blue");

assert.deepEqual(signalSummary(state), {
  event: "candidate_optimization_summary",
  topReject: "net_profit 1 < minimum 2:8",
  missingRates: "2",
  errors: 0,
  warnings: 1,
});

const rendered = renderToString(React.createElement(Dashboard, { state: snapshot, now }));
for (const text of [
  "Polygon Arbitrage Bot",
  "Live execution monitor",
  "Overview",
  "mode",
  "loop-live",
  "passes",
  "eval",
  "candidates",
  "optimized",
  "profitable",
  "pools",
  "paths",
  "last pass",
  "missingRates",
  "Top Opportunities",
  "UNISWAP_V3",
  "123.456789 USDC",
  "Recent Logs",
]) {
  assert.ok(rendered.includes(text), `Ink dashboard should include ${text}`);
}

assert.equal(typeof startTui({ ...state }), "function");

console.log("TUI checks passed.");
