import assert from "node:assert/strict";

import { normalizePoolState, validatePoolState } from "../src/state/normalizer.ts";
import { computeProfit } from "../src/profit/compute.ts";
import { buildArbTx } from "../src/execution/build_tx.ts";
import { getResultHopCount } from "../src/routing/path_hops.ts";
import { metadataWithTokenDecimals } from "../src/state/poll_curve.ts";

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

const mixedDecimalCurve = normalizePoolState(
  "0x1111111111111111111111111111111111111111",
  "CURVE_MAIN",
  [
    "0x2222222222222222222222222222222222222222",
    "0x3333333333333333333333333333333333333333",
  ],
  {
    balances: [1_000_000n, 10n ** 18n],
    A: 10_000n,
    fee: 4_000_000n,
    fetchedAt: Date.now(),
  },
  {
    tokenDecimals: [6, 18],
  },
);
assert(mixedDecimalCurve, "Curve mixed-decimal state should normalize when token decimals are known");
assert.deepEqual(
  mixedDecimalCurve?.rates,
  [10n ** 30n, 10n ** 18n],
  "Curve default rates should scale raw mixed-decimal balances into a common 18-decimal precision domain",
);
assert.deepEqual(
  mixedDecimalCurve?.tokenDecimals,
  [6, 18],
  "Curve canonical state should retain the token decimals used to derive default rates",
);

const curveMetadata = metadataWithTokenDecimals(
  {
    metadata: { source: "registry" },
  },
  [
    "0x2222222222222222222222222222222222222222",
    "0x3333333333333333333333333333333333333333",
  ],
  new Map([
    ["0x2222222222222222222222222222222222222222", 6],
    ["0x3333333333333333333333333333333333333333", 18],
  ]),
);
assert.deepEqual(
  curveMetadata,
  {
    source: "registry",
    tokenDecimals: [6, 18],
    tokenDecimalsByAddress: {
      "0x2222222222222222222222222222222222222222": 6,
      "0x3333333333333333333333333333333333333333": 18,
    },
  },
  "Curve RPC refresh should carry registry token decimals into normalization metadata",
);

const mixedDecimalV2 = normalizePoolState(
  "0x1111111111111111111111111111111111111111",
  "COMETHSWAP_V2",
  [
    "0x2222222222222222222222222222222222222222",
    "0x3333333333333333333333333333333333333333",
  ],
  {
    reserve0: 1_000_000n,
    reserve1: 10n ** 18n,
    blockTimestampLast: 123,
    fetchedAt: Date.now(),
  },
  {
    feeNumerator: 995,
    tokenDecimals: [6, 18],
  },
);
assert(mixedDecimalV2, "V2 variants should normalize with registry token decimals");
assert.deepEqual(mixedDecimalV2?.tokenDecimals, [6, 18], "V2 canonical state should retain token decimals");
assert.equal(mixedDecimalV2?.fee, 995n, "V2 canonical state should retain variant-specific fee numerator");
assert.equal(mixedDecimalV2?.feeDenominator, 1000n, "V2 canonical state should retain fee denominator metadata");
assert.equal(mixedDecimalV2?.blockTimestampLast, 123, "V2 canonical state should retain pair reserve timestamp");

const algebraV3 = normalizePoolState(
  "0x1111111111111111111111111111111111111111",
  "KYBERSWAP_ELASTIC",
  [
    "0x2222222222222222222222222222222222222222",
    "0x3333333333333333333333333333333333333333",
  ],
  {
    sqrtPriceX96: 1n,
    tick: 0,
    liquidity: 10n,
    fee: 500,
    tickSpacing: 10,
    ticks: new Map(),
    fetchedAt: Date.now(),
    initialized: true,
    isAlgebra: true,
    isKyberElastic: true,
    hydrationMode: "nearby",
  },
  {
    tokenDecimals: [18, 6],
    isAlgebra: true,
    isKyberElastic: true,
  },
);
assert(algebraV3, "Algebra-family V3 variants should normalize through the V3 path");
assert.deepEqual(algebraV3?.tokenDecimals, [18, 6], "V3 canonical state should retain token decimals");
assert.equal(algebraV3?.isAlgebra, true, "V3 canonical state should retain Algebra-family metadata");
assert.equal(algebraV3?.isKyberElastic, true, "Kyber canonical state should retain variant metadata");
assert.equal(algebraV3?.hydrationMode, "nearby", "V3 canonical state should retain tick hydration metadata");

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
    poolId: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    lastChangeBlock: 456,
    fetchedAt: Date.now(),
  },
  {
    tokenDecimals: [18, 6, 8],
    poolType: "weighted",
    specialization: "2",
  },
);
assert(normalizedBalancer, "normalizer should build fallback Balancer weights when chain weights are unavailable");
assert.deepEqual(
  normalizedBalancer?.tokenDecimals,
  [18, 6, 8],
  "Balancer canonical state should retain registry token decimals",
);
assert.equal(
  normalizedBalancer?.balancerPoolId,
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "Balancer canonical state should retain the Vault poolId used for getPoolTokens",
);
assert.equal(normalizedBalancer?.lastChangeBlock, 456, "Balancer canonical state should retain Vault lastChangeBlock");
assert.equal(normalizedBalancer?.poolType, "weighted", "Balancer canonical state should retain pool type metadata");
assert.equal(normalizedBalancer?.specialization, "2", "Balancer canonical state should retain Vault specialization metadata");
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

assert.equal(
  getResultHopCount({
    hopCount: 99,
    poolPath: ["0xp0", "0xp1"],
    tokenPath: ["0xt0", "0xt1", "0xt2"],
    hopAmounts: [1n, 2n, 3n],
  }),
  2,
  "stale numeric hop metadata should be ignored when structural route metadata agrees",
);

assert.equal(
  getResultHopCount({
    poolPath: ["0xp0", "0xp1", "0xp2"],
    tokenPath: ["0xt0", "0xt1", "0xt2"],
    hopAmounts: [1n, 2n, 3n],
  }),
  0,
  "conflicting hop metadata should not produce a canonical hop count",
);

const staleNumericHopAssessment = computeProfit(
  {
    amountIn: 10_000n,
    amountOut: 10_500n,
    profit: 500n,
    totalGas: 0,
    hopCount: 99,
    poolPath: ["0xp0", "0xp1"],
    tokenPath: ["0xt0", "0xt1", "0xt2"],
    hopAmounts: [10_000n, 10_250n, 10_500n],
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
  staleNumericHopAssessment.revertPenalty,
  25n,
  "stale numeric hop metadata should be ignored when structural route metadata agrees",
);

const inconsistentHopAssessment = computeProfit(
  {
    amountIn: 10_000n,
    amountOut: 10_500n,
    profit: 500n,
    totalGas: 0,
    poolPath: ["0xp0", "0xp1", "0xp2"],
    tokenPath: ["0xt0", "0xt1", "0xt2"],
    hopAmounts: [10_000n, 10_250n, 10_500n],
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
  inconsistentHopAssessment.shouldExecute,
  false,
  "profit assessment should reject route results whose hop metadata disagrees",
);
assert.equal(inconsistentHopAssessment.rejectReason, "invalid hopCount");

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

await assert.rejects(
  () =>
    buildArbTx(
      {
        path: {
          startToken: "0x0000000000000000000000000000000000000001",
          edges: Array.from({ length: 7 }, (_, index) => ({
            protocol: index % 2 === 0 ? "UNISWAP_V2" : "SUSHISWAP_V2",
            poolAddress: `0x${String(index + 10).padStart(40, "0")}`,
            tokenIn: `0x${String(index + 1).padStart(40, "0")}`,
            tokenOut: `0x${String(index + 2).padStart(40, "0")}`,
            zeroForOne: true,
          })),
        },
        result: {
          amountIn: 100n,
          amountOut: 140n,
          profit: 40n,
          hopAmounts: [100n, 105n, 110n, 115n, 120n, 125n, 130n, 140n],
          tokenPath: Array.from({ length: 8 }, (_, index) => `0x${String(index + 1).padStart(40, "0")}`),
          poolPath: Array.from({ length: 7 }, (_, index) => `0x${String(index + 10).padStart(40, "0")}`),
        },
      },
      {
        executorAddress: "0x0000000000000000000000000000000000000001",
        fromAddress: "0x0000000000000000000000000000000000000002",
      },
      {
        gasParamsOverride: {
          gasLimit: 1n,
          maxFeePerGas: 1n,
          maxPriorityFeePerGas: 1n,
          estimatedCostWei: 1n,
        },
      },
    ),
  /route expands to 14 executor calls/,
  "buildArbTx should reject long routes that exceed the executor call budget before submission",
);

console.log("Integrity guard checks passed.");
