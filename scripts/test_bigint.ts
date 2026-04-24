import assert from "node:assert/strict";

import { toFiniteNumber } from "../src/util/bigint.ts";

assert.equal(toFiniteNumber(123n), 123);
assert.equal(toFiniteNumber("42"), 42);
assert.equal(
  toFiniteNumber(10n ** 400n, 7),
  7,
  "oversized bigint inputs should fail closed instead of becoming Infinity",
);
assert.equal(
  toFiniteNumber(-(10n ** 400n), -3),
  -3,
  "oversized negative bigint inputs should also fail closed instead of becoming -Infinity",
);
assert.equal(
  toFiniteNumber(Number.NaN, 5),
  5,
  "NaN numbers should continue to use the fallback",
);

console.log("Bigint utility checks passed.");
