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

assert.equal(
  validatePoolState({
    poolId: "0x1111111111111111111111111111111111111111",
    protocol: "UNISWAP_V2",
    token0: "0x2222222222222222222222222222222222222222",
    token1: "0x3333333333333333333333333333333333333333",
    tokens: [
      "0x2222222222222222222222222222222222222222",
      "0x2222222222222222222222222222222222222222",
    ],
    reserve0: 1000n,
    reserve1: 2000n,
    fee: 997n,
    timestamp: Date.now(),
  }).valid,
  false,
  "validator should reject duplicate token addresses in canonical state",
);

assert.equal(
  validatePoolState({
    poolId: "0x1111111111111111111111111111111111111111",
    protocol: "UNISWAP_V3",
    token0: "0x2222222222222222222222222222222222222222",
    token1: "0x3333333333333333333333333333333333333333",
    tokens: [
      "0x2222222222222222222222222222222222222222",
      "0x3333333333333333333333333333333333333333",
      "0x4444444444444444444444444444444444444444",
    ],
    fee: 3000n,
    sqrtPriceX96: 1n,
    tick: 0,
    liquidity: 1000n,
    initialized: true,
    ticks: new Map(),
    timestamp: Date.now(),
  }).valid,
  false,
  "validator should reject V3 states with non-pair token counts",
);

assert.equal(
  validatePoolState({
    poolId: "0x1111111111111111111111111111111111111111",
    protocol: "CURVE_MAIN",
    token0: "0x2222222222222222222222222222222222222222",
    token1: "0x3333333333333333333333333333333333333333",
    tokens: [
      "0x2222222222222222222222222222222222222222",
      "0x3333333333333333333333333333333333333333",
      "0x4444444444444444444444444444444444444444",
    ],
    balances: [1000n, 2000n],
    rates: [ONE, ONE],
    A: 100n,
    fee: 4_000_000n,
    timestamp: Date.now(),
  }).valid,
  false,
  "validator should reject Curve states whose token and balance arrays diverge",
);

const normalizedBalancer = normalizePoolState(
  "0x1111111111111111111111111111111111111111",
  "BALANCER_V2",
  [
    "0x2222222222222222222222222222222222222222",
    "0x3333333333333333333333333333333333333333",
    "0x4444444444444444444444444444444444444444",
  ],
  {
    balances: [1000n, 2000n, 3000n],
    swapFee: 3_000_000_000_000_000n,
    fetchedAt: Date.now(),
  }
);
assert(normalizedBalancer, "normalizer should build fallback Balancer weights when chain weights are unavailable");
assert.equal(
  normalizedBalancer?.weights?.reduce((sum: bigint, weight: bigint) => sum + weight, 0n),
  ONE,
  "fallback Balancer weights should sum exactly to 1e18",
);
assert.equal(
  validatePoolState({
    poolId: "0x1111111111111111111111111111111111111111",
    protocol: "BALANCER_V2",
    token0: "0x2222222222222222222222222222222222222222",
    token1: "0x3333333333333333333333333333333333333333",
    tokens: [
      "0x2222222222222222222222222222222222222222",
      "0x3333333333333333333333333333333333333333",
    ],
    balances: [1000n, 2000n],
    weights: [ONE / 3n, ONE / 3n],
    swapFee: 3_000_000_000_000_000n,
    timestamp: Date.now(),
  }).valid,
  false,
  "validator should reject Balancer weights that do not sum to 1e18",
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

const hopAwareAssessment = computeProfit(
  {
    amountIn: 10_000n,
    amountOut: 10_500n,
    profit: 500n,
    totalGas: 0,
    hopCount: 4,
  },
  {
    gasPriceWei: 0n,
    tokenToMaticRate: 1n,
    slippageBps: 0n,
    revertRiskBps: 500n,
    minNetProfit: 0n,
  }
);
assert.equal(
  hopAwareAssessment.revertPenalty,
  45n,
  "computeProfit should derive revert risk from the canonical hop count in the route result when no override is provided",
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
              tokenIn: "0xstart",
              tokenOut: "0xout",
            },
          ],
        },
        result: {
          amountIn: 100n,
          amountOut: 120n,
          profit: 20n,
          hopAmounts: [100n, 120n],
          tokenPath: ["0xstart", "0xwrong"],
          poolPath: ["0xpool"],
        },
      },
      { executorAddress: "0x0000000000000000000000000000000000000001", fromAddress: "0x0000000000000000000000000000000000000002" }
    ),
  /tokenPath output mismatch/,
  "buildArbTx should reject route metadata that disagrees with the execution edges",
);

console.log("Integrity guard checks passed.");
