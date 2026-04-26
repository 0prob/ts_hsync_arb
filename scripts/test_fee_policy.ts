import assert from "node:assert/strict";

import { capGasFeesToBudget, effectiveGasPriceWei } from "../src/execution/gas.ts";

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

console.log("Fee policy checks passed.");
