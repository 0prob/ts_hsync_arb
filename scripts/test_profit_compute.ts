import assert from "node:assert/strict";

import {
  applySlippage,
  computeProfit,
  gasCostInTokenUnits,
  isProfitable,
  revertRiskPenalty,
} from "../src/profit/compute.ts";
import {
  estimateGasCostWei,
  gasCostInStartTokenUnits,
  scoreRoute,
} from "../src/routing/score_route.ts";

const routeResult = {
  amountIn: 1_000_000n,
  amountOut: 1_010_000n,
  profit: 10_000n,
  profitable: true,
  totalGas: 100_000,
  hopAmounts: [1_000_000n, 1_010_000n],
};

{
  const assessment = computeProfit(routeResult, {
    gasPriceWei: 100n,
    tokenToMaticRate: 3n,
    slippageBps: 0n,
    revertRiskBps: 0n,
    minNetProfit: 0n,
  });

  assert.equal(assessment.gasCostWei, 10_000_000n);
  assert.equal(assessment.gasCostInTokens, 3_333_334n);
  assert.equal(
    gasCostInStartTokenUnits(assessment.gasCostWei, 3n),
    assessment.gasCostInTokens,
    "route scoring and execution-grade profit should share gas conversion semantics",
  );
  assert.equal(assessment.shouldExecute, false);
  assert.match(assessment.rejectReason, /net profit|gas cost/i);
}

{
  const assessment = computeProfit(
    {
      ...routeResult,
      hopAmounts: undefined,
      hopCount: 2.5,
    } as any,
    {
      gasPriceWei: 1n,
      tokenToMaticRate: 1_000_000n,
      slippageBps: 0n,
      revertRiskBps: 0n,
      minNetProfit: 0n,
    },
  );

  assert.equal(assessment.shouldExecute, false);
  assert.equal(assessment.rejectReason, "invalid hopCount");
}

{
  const assessment = computeProfit(routeResult, {
    gasPriceWei: 1n,
    tokenToMaticRate: 1_000_000n,
    slippageBps: 0n,
    revertRiskBps: 0n,
    minNetProfit: 9_900n,
  });

  assert.equal(assessment.netProfitAfterGas, 9_999n);
  assert.equal(assessment.shouldExecute, true);
  assert.equal(isProfitable(routeResult, {
    gasPriceWei: 1n,
    tokenToMaticRate: 1_000_000n,
    slippageBps: 0n,
    revertRiskBps: 0n,
    minNetProfit: 9_900n,
  }), true);
}

assert.equal(gasCostInTokenUnits(10n, 3n), 4n);
assert.equal(estimateGasCostWei(Number.MAX_SAFE_INTEGER + 1, 1n), null);
assert.equal(
  scoreRoute({ hopCount: 0, edges: [] }, routeResult, { gasPriceWei: 1n }),
  null,
  "route scoring should reject impossible zero-hop profitable results",
);
assert.throws(() => gasCostInTokenUnits(10n, 0n), /tokenToMaticRate must be > 0/);
assert.throws(() => applySlippage(100n, -1n), /slippageBps/);
assert.throws(() => applySlippage(-1n, 0n), /amountOut/);
assert.throws(() => revertRiskPenalty(-1n, 2), /grossProfit/);
assert.throws(() => revertRiskPenalty(1n, 0), /hopCount/);
assert.throws(() => revertRiskPenalty(1n, 2, 10_001n), /revertRiskBps/);

console.log("Profit compute checks passed.");
