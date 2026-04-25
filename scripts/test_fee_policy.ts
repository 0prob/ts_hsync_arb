import assert from "node:assert/strict";

import { effectiveGasPriceWei } from "../src/execution/gas.ts";

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

console.log("Fee policy checks passed.");
