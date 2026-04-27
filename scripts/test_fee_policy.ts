import assert from "node:assert/strict";

import {
  capGasFeesToBudget,
  clearGasEstimateCache,
  effectiveGasPriceWei,
  gasEstimateCacheStats,
  quickGasCheck,
  recommendGasParams,
  scalePriorityFeeByProfitMargin,
} from "../src/execution/gas.ts";

{
  const baseFee = 30n * 10n ** 9n;
  const priorityFee = 2n * 10n ** 9n;
  const maxFee = 90n * 10n ** 9n;

  assert.equal(
    effectiveGasPriceWei({ baseFee, priorityFee, maxFee }),
    32n * 10n ** 9n,
    "effective gas price should use base fee plus priority fee below the max fee cap",
  );
}

assert.throws(
  () => effectiveGasPriceWei({ baseFee: 30n, priorityFee: 1n, maxFee: 29n }),
  /maxFee must be >= baseFee/,
  "invalid EIP-1559 snapshots should not undercount gas below base fee",
);

{
  const baseFee = 30n * 10n ** 9n;
  const priorityFee = 50n * 10n ** 9n;
  const maxFee = 60n * 10n ** 9n;

  assert.equal(
    effectiveGasPriceWei({ baseFee, priorityFee, maxFee }),
    maxFee,
    "effective gas price should cap at maxFeePerGas",
  );
}

{
  const capped = capGasFeesToBudget(
    {
      baseFee: 30n,
      maxPriorityFeePerGas: 50n,
      maxFeePerGas: 100n,
    },
    10n,
    350n,
  );

  assert.equal(capped.maxFeePerGas, 35n);
  assert.equal(
    capped.maxPriorityFeePerGas,
    5n,
    "budget-aware fee caps should preserve baseFee first and spend only affordable priority fee",
  );
  assert.equal(
    effectiveGasPriceWei({
      baseFee: 30n,
      priorityFee: capped.maxPriorityFeePerGas,
      maxFee: capped.maxFeePerGas,
    }),
    35n,
    "budget-aware fee caps should bound expected gas price by maxEstimatedCostWei / gasLimit",
  );
}

{
  const uncapped = capGasFeesToBudget(
    {
      baseFee: 30n,
      maxPriorityFeePerGas: 2n,
      maxFeePerGas: 90n,
    },
    10n,
    1_000n,
  );

  assert.deepEqual(
    uncapped,
    {
      maxPriorityFeePerGas: 2n,
      maxFeePerGas: 90n,
    },
    "gas budgets above the proposed bid should leave fees unchanged",
  );
}

assert.throws(
  () =>
    capGasFeesToBudget(
      {
        baseFee: 30n,
        maxPriorityFeePerGas: 2n,
        maxFeePerGas: 90n,
      },
      10n,
      299n,
    ),
  /below current baseFee/i,
  "gas budgets below base fee should fail before transaction build",
);

{
  const bid = scalePriorityFeeByProfitMargin(
    { baseFee: 30n, priorityFee: 2n, maxFee: 90n },
    250n,
    { minMultiplierBps: 10_000n, maxMultiplierBps: 20_000n, fullRampMarginBps: 500n },
  );

  assert.equal(bid.multiplierBps, 15_000n);
  assert.equal(bid.maxPriorityFeePerGas, 3n);
  assert.equal(bid.maxFeePerGas, 63n);
}

assert.throws(
  () => scalePriorityFeeByProfitMargin(
    { baseFee: 30n, priorityFee: 2n, maxFee: 90n },
    1n,
    { minMultiplierBps: 20_000n, maxMultiplierBps: 10_000n },
  ),
  /maxMultiplierBps/,
  "priority fee scaling should reject inverted multiplier ranges",
);

await assert.rejects(
  () => quickGasCheck(1.5),
  /estimatedGasUnits/,
  "quick gas checks should reject fractional gas units before touching the oracle",
);
await assert.rejects(
  () => quickGasCheck(0),
  /estimatedGasUnits/,
  "quick gas checks should reject zero gas units before touching the oracle",
);

{
  clearGasEstimateCache();
  let estimateCalls = 0;
  const tx = { to: "0x1111111111111111111111111111111111111111", data: "0x", value: 0n };
  const sender = "0x2222222222222222222222222222222222222222";
  const feeSnapshot = { baseFee: 30n, priorityFee: 2n, maxFee: 90n };
  const estimateGasFn = async () => {
    estimateCalls++;
    return 100_000n;
  };

  const first = await recommendGasParams(tx, sender, {
    gasEstimateCacheKey: "route-a",
    gasMultiplier: 1,
    feeSnapshot,
    estimateGasFn,
    now: 1_000,
  });
  const second = await recommendGasParams(tx, sender, {
    gasEstimateCacheKey: "route-a",
    gasMultiplier: 1,
    feeSnapshot,
    estimateGasFn,
    now: 2_000,
  });

  assert.equal(estimateCalls, 1, "fresh gas estimate cache entries should avoid duplicate eth_estimateGas calls");
  assert.equal(first.gasLimit, 100_000n);
  assert.equal(second.gasLimit, 100_000n);

  const third = await recommendGasParams(tx, sender, {
    gasEstimateCacheKey: "route-a",
    gasMultiplier: 1,
    feeSnapshot,
    estimateGasFn,
    now: 4_000,
    gasEstimateCacheTtlMs: 1_000,
  });
  assert.equal(estimateCalls, 2, "expired gas estimate cache entries should be refreshed");
  assert.equal(third.gasLimit, 100_000n);

  await recommendGasParams(tx, sender, {
    gasEstimateCacheKey: "route-b",
    gasMultiplier: 1,
    feeSnapshot,
    estimateGasFn,
    now: 5_000,
    gasEstimateCacheMaxEntries: 1,
  });
  assert.deepEqual(gasEstimateCacheStats().keys, ["route-b"]);
}

console.log("Fee policy checks passed.");
