import assert from "node:assert/strict";

import { takeTopNBy } from "../src/util/bounded_priority.ts";

const items = [
  { id: "d", rank: 4 },
  { id: "b", rank: 2 },
  { id: "a", rank: 1 },
  { id: "c", rank: 3 },
];

const top2 = takeTopNBy(items, 2, (left, right) => left.rank - right.rank);
assert.deepEqual(
  top2.map((item) => item.id),
  ["a", "b"],
  "takeTopNBy should keep the best N items without sorting the full input",
);

const top10 = takeTopNBy(items, 10, (left, right) => left.rank - right.rank);
assert.deepEqual(
  top10.map((item) => item.id),
  ["a", "b", "c", "d"],
  "takeTopNBy should preserve ascending priority order when limit exceeds input size",
);

const none = takeTopNBy(items, 0, (left, right) => left.rank - right.rank);
assert.deepEqual(none, [], "takeTopNBy should return an empty array for a zero limit");

console.log("Bounded priority checks passed.");
