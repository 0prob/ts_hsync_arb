import assert from "node:assert/strict";

import { toRouteResultLike } from "../src/arb/search.ts";

const normalized = toRouteResultLike({
  amountIn: Number.NaN,
  amountOut: "bad-output",
  profit: 10.5,
  profitable: true,
  totalGas: 21_000,
  hopAmounts: [100n, "200", "oops", Number.POSITIVE_INFINITY],
  poolPath: ["0xpool"],
  tokenPath: ["0xt0", "0xt1"],
});

assert.equal(
  normalized.amountIn,
  0n,
  "route result normalization should fail closed on NaN amountIn instead of throwing",
);
assert.equal(
  normalized.amountOut,
  0n,
  "route result normalization should fail closed on malformed amountOut strings instead of throwing",
);
assert.equal(
  normalized.profit,
  0n,
  "route result normalization should fail closed on fractional profits instead of throwing",
);
assert.deepEqual(
  normalized.hopAmounts,
  [100n, 200n, 0n, 0n],
  "route result normalization should sanitize malformed hop amounts instead of crashing candidate normalization",
);
assert.equal(normalized.profitable, true);
assert.equal(normalized.totalGas, 21_000);

const booleanAndIntegerStrings = toRouteResultLike({
  amountIn: true,
  amountOut: "42",
  profit: "-7",
  hopAmounts: ["1", false, "003"],
});

assert.equal(booleanAndIntegerStrings.amountIn, 1n);
assert.equal(booleanAndIntegerStrings.amountOut, 42n);
assert.equal(booleanAndIntegerStrings.profit, -7n);
assert.deepEqual(booleanAndIntegerStrings.hopAmounts, [1n, 0n, 3n]);

console.log("Amount normalization checks passed.");
