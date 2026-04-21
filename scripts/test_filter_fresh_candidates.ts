import assert from "node:assert/strict";

import { partitionFreshCandidates } from "../src/routing/filter_fresh_candidates.ts";
import { getPathFreshness } from "../src/routing/path_freshness.ts";

const now = Date.now();
const candidates = [
  {
    id: "fresh",
    path: {
      edges: [
        { poolAddress: "0xpool1" },
        { poolAddress: "0xpool2" },
      ],
    },
  },
  {
    id: "stale",
    path: {
      edges: [
        { poolAddress: "0xpool3" },
        { poolAddress: "0xpool4" },
      ],
    },
  },
  {
    id: "skewed",
    path: {
      edges: [
        { poolAddress: "0xpool5" },
        { poolAddress: "0xpool6" },
      ],
    },
  },
];

const stateCache = new Map([
  ["0xpool1", { timestamp: now - 100 }],
  ["0xpool2", { timestamp: now - 50 }],
  ["0xpool3", { timestamp: now - 5_000 }],
  ["0xpool4", { timestamp: now - 5_000 }],
  ["0xpool5", { timestamp: now - 100 }],
  ["0xpool6", { timestamp: now - 2_000 }],
]);

const { fresh, stale } = partitionFreshCandidates(
  candidates,
  (path) => getPathFreshness(path, stateCache, {
    maxAgeMs: 1_000,
    maxSkewMs: 500,
  }),
);

assert.deepEqual(
  fresh.map((candidate) => candidate.id),
  ["fresh"],
  "only routes backed by fresh aligned pool state should remain eligible",
);
assert.deepEqual(
  stale.map(({ candidate }) => candidate.id),
  ["stale", "skewed"],
  "stale and skewed routes should be filtered out before execution ranking",
);
assert.match(
  stale[0]?.freshness.reason ?? "",
  /route state age/,
  "stale age failures should preserve the freshness reason",
);
assert.match(
  stale[1]?.freshness.reason ?? "",
  /route state skew/,
  "stale skew failures should preserve the freshness reason",
);

console.log("Fresh candidate partition checks passed.");
