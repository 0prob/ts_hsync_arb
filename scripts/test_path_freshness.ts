import assert from "node:assert/strict";

import { getPathFreshness } from "../src/routing/path_freshness.ts";

const now = Date.now();
const path = {
  edges: [
    { poolAddress: "0xpool1" },
    { poolAddress: "0xpool2" },
  ],
};

const freshStateCache = new Map([
  ["0xpool1", { timestamp: now - 100 }],
  ["0xpool2", { timestamp: now - 50 }],
]);

const fresh = getPathFreshness(path, freshStateCache, {
  maxAgeMs: 1_000,
  maxSkewMs: 500,
});
assert.equal(fresh.ok, true, "recent aligned timestamps should be considered fresh");

const stale = getPathFreshness(path, new Map([
  ["0xpool1", { timestamp: now - 5_000 }],
  ["0xpool2", { timestamp: now - 5_000 }],
]), {
  maxAgeMs: 1_000,
  maxSkewMs: 500,
});
assert.equal(stale.ok, false, "old timestamps should be rejected");
assert.match(stale.reason, /route state age/, "stale result should explain age failure");

const skewed = getPathFreshness(path, new Map([
  ["0xpool1", { timestamp: now - 100 }],
  ["0xpool2", { timestamp: now - 2_000 }],
]), {
  maxAgeMs: 5_000,
  maxSkewMs: 500,
});
assert.equal(skewed.ok, false, "large timestamp skew should be rejected");
assert.match(skewed.reason, /route state skew/, "skew result should explain skew failure");

const missing = getPathFreshness(path, new Map([
  ["0xpool1", { timestamp: now - 100 }],
]), {
  maxAgeMs: 1_000,
  maxSkewMs: 500,
});
assert.equal(missing.ok, false, "missing pool timestamps should be rejected");
assert.equal(missing.reason, "missing pool timestamp");

console.log("Path freshness checks passed.");
