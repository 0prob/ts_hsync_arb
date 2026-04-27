import assert from "node:assert/strict";

import { getPathFreshness } from "../src/routing/path_freshness.ts";

const poolA = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const poolB = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const nowMs = 10_000;

const path = {
  edges: [
    { poolAddress: poolA.toUpperCase() },
    { poolAddress: poolB },
  ],
};

{
  const freshness = getPathFreshness(
    path,
    new Map([
      [poolA, { timestamp: nowMs - 900 }],
      [poolB, { timestamp: nowMs - 100 }],
    ]),
    { maxAgeMs: 1_000, maxSkewMs: 1_000, nowMs },
  );

  assert.deepEqual(freshness, { ok: true, ageMs: 900, skewMs: 800 });
}

{
  const freshness = getPathFreshness(
    path,
    new Map([
      [poolA, { timestamp: nowMs - 1_500 }],
      [poolB, { timestamp: nowMs - 100 }],
    ]),
    { maxAgeMs: 1_000, maxSkewMs: 2_000, nowMs },
  );

  assert.equal(freshness.ok, false);
  assert.match(freshness.reason ?? "", /route state age 1500ms > 1000ms/);
  assert.equal(freshness.ageMs, 1_500);
  assert.equal(freshness.skewMs, 1_400);
}

{
  const freshness = getPathFreshness(
    { edges: [{ poolAddress: "not-an-address" }] },
    new Map(),
    { maxAgeMs: 1_000, maxSkewMs: 1_000, nowMs },
  );

  assert.deepEqual(freshness, { ok: false, reason: "invalid pool address" });
}

{
  const freshness = getPathFreshness(
    { edges: [] },
    new Map(),
    { maxAgeMs: 1_000, maxSkewMs: 1_000, nowMs },
  );

  assert.deepEqual(freshness, { ok: false, reason: "missing route edges" });
}

console.log("Path freshness checks passed.");
