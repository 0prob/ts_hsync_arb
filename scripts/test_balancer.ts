import assert from "node:assert/strict";

import { getBalancerAmountOut, simulateBalancerSwap } from "../src/math/balancer.ts";

const ONE = 10n ** 18n;

const healthyState = {
  balances: [1_000n * ONE, 1_000n * ONE],
  weights: [ONE / 2n, ONE / 2n],
  swapFee: 3_000_000_000_000_000n,
};

const malformedFeeState = {
  balances: [1_000n, 1_000n],
  weights: [ONE / 2n, ONE / 2n],
  swapFee: 2n * ONE,
};

assert(getBalancerAmountOut(ONE, healthyState, 0, 1) > 0n, "healthy weighted swap should quote output");
assert.equal(
  getBalancerAmountOut(100n, malformedFeeState, 0, 1),
  0n,
  "invalid fee should be treated as unsimulatable instead of throwing"
);
assert.equal(
  getBalancerAmountOut(100n, healthyState, 0, 2),
  0n,
  "out-of-range token indices should return zero"
);
assert.deepEqual(
  simulateBalancerSwap(100n, malformedFeeState, 0, 1),
  { amountOut: 0n, gasEstimate: 150_000 },
  "wrapper should stay non-fatal on malformed Balancer state"
);

console.log("Balancer regression checks passed.");
