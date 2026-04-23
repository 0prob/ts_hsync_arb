import assert from "node:assert/strict";

import { getBalancerAmountIn, getBalancerAmountOut, simulateBalancerSwap } from "../src/math/balancer.ts";

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

{
  const amountIn = 10n * 10n ** 15n;
  const amountOut = getBalancerAmountOut(amountIn, healthyState, 0, 1);
  const requiredAmountIn = getBalancerAmountIn(amountOut, healthyState, 0, 1);

  assert.equal(
    getBalancerAmountOut(requiredAmountIn, healthyState, 0, 1) >= amountOut,
    true,
    "exact-output Balancer quote should never underestimate the required input",
  );
  assert.equal(
    getBalancerAmountOut(requiredAmountIn - 1n, healthyState, 0, 1) < amountOut,
    true,
    "exact-output Balancer quote should return the minimal sufficient input",
  );
}

console.log("Balancer regression checks passed.");
