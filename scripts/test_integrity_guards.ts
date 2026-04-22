import assert from "node:assert/strict";

import { normalizePoolState, validatePoolState } from "../src/state/normalizer.ts";
import { computeProfit } from "../src/profit/compute.ts";
import { buildArbTx } from "../src/execution/build_tx.ts";

const ONE = 10n ** 18n;

const invalidBalancer = normalizePoolState(
  "0xpool",
  "BALANCER_V2",
  ["0xt0", "0xt1"],
  {
    balances: [1000n, 2000n],
    weights: [ONE / 2n],
    swapFee: 2n * ONE,
    fetchedAt: Date.now(),
  }
);

assert.equal(invalidBalancer, null, "invalid Balancer state should be rejected during normalization");
assert.equal(
  validatePoolState({
    poolId: "0xpool",
    protocol: "BALANCER_V2",
    tokens: ["0xt0", "0xt1"],
    balances: [1000n, 2000n],
    weights: [ONE / 2n],
    swapFee: 2n * ONE,
    timestamp: Date.now(),
  }).valid,
  false,
  "validator should reject malformed Balancer state"
);

const badAssessment = computeProfit(
  { amountIn: 100n, amountOut: 150n, profit: 999n, totalGas: 21000 },
  { gasPriceWei: 1n }
);
assert.equal(badAssessment.shouldExecute, false, "profit mismatch should reject assessment");
assert.equal(badAssessment.rejectReason, "profit mismatch");

const roundedGasAssessment = computeProfit(
  { amountIn: 10_000n, amountOut: 10_010n, profit: 10n, totalGas: 1 },
  {
    gasPriceWei: 1n,
    tokenToMaticRate: 2n,
    slippageBps: 0n,
    revertRiskBps: 0n,
    minNetProfit: 10n,
  }
);
assert.equal(
  roundedGasAssessment.gasCostInTokens,
  1n,
  "token-denominated gas should round up so nonzero gas cannot disappear during conversion",
);
assert.equal(
  roundedGasAssessment.netProfitAfterGas,
  9n,
  "rounded gas cost should reduce net profit after gas",
);
assert.equal(
  roundedGasAssessment.shouldExecute,
  false,
  "a trade that only clears the floor because gas rounded to zero should be rejected",
);

await assert.rejects(
  () =>
    buildArbTx(
      {
        path: {
          startToken: "0xstart",
          edges: [
            {
              protocol: "UNISWAP_V2",
              poolAddress: "0xpool",
              tokenIn: "0xin",
              tokenOut: "0xout",
            },
          ],
        },
        result: {
          amountIn: 100n,
          amountOut: 120n,
          profit: 20n,
          hopAmounts: [100n],
          tokenPath: ["0xstart", "0xout"],
          poolPath: ["0xpool"],
        },
      },
      { executorAddress: "0x0000000000000000000000000000000000000001", fromAddress: "0x0000000000000000000000000000000000000002" }
    ),
  /hopAmounts length mismatch/,
  "buildArbTx should reject malformed route metadata before gas estimation"
);

console.log("Integrity guard checks passed.");
