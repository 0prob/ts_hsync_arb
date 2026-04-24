import assert from "node:assert/strict";

import { estimateGasCostWei, gasCostInStartTokenUnits, rankRoutes, scoreRoute } from "../src/routing/score_route.ts";

const path = {
  hopCount: 2,
  edges: [
    { protocol: "UNISWAP_V2" },
    { protocol: "SUSHISWAP_V2" },
  ],
};

const result = {
  profitable: true,
  amountIn: 1_000_000n,
  profit: 100_000n,
  totalGas: 100_000,
};

const gasPriceWei = 30n * 10n ** 9n;
const gasCostWei = estimateGasCostWei(result.totalGas, gasPriceWei);
assert.equal(gasCostWei, 3_000_000_000_000_000n);

const usdcLikeTokenToMaticRate = 10n ** 12n;
assert.equal(
  gasCostInStartTokenUnits(gasCostWei, usdcLikeTokenToMaticRate),
  3_000n,
  "gas should be normalized into raw start-token units when a conversion rate is provided",
);
assert.equal(
  gasCostInStartTokenUnits(1n, 2n),
  1n,
  "gas normalization should round up so ranking does not underprice fractional token gas costs",
);

const scoredWithRate = scoreRoute(path, result, {
  gasPriceWei,
  tokenToMaticRate: usdcLikeTokenToMaticRate,
});
assert(scoredWithRate, "scoring should succeed with a valid token/MATIC rate");
assert.equal(
  scoredWithRate.netProfit,
  97_000n,
  "net profit should subtract gas in start-token units, not raw wei, for non-native tokens",
);
assert.equal(scoredWithRate.gasCostInTokens, 3_000n);

const conservativelyRounded = scoreRoute(
  path,
  {
    profitable: true,
    amountIn: 10n,
    profit: 1n,
    totalGas: 1,
  },
  {
    gasPriceWei: 1n,
    tokenToMaticRate: 2n,
  },
);
assert(conservativelyRounded, "route scoring should still return a rankable candidate at zero net profit");
assert.equal(
  conservativelyRounded.gasCostInTokens,
  1n,
  "route scoring should round gas up to the smallest whole start-token unit",
);
assert.equal(
  conservativelyRounded.netProfit,
  0n,
  "rounded-up gas should eliminate marginal profit in the ranker just as it does in execution-grade assessment",
);

const scoredWithStaleHopCount = scoreRoute(
  {
    ...path,
    hopCount: 99,
  },
  result,
  {
    gasPriceWei,
    tokenToMaticRate: usdcLikeTokenToMaticRate,
  },
);
assert(scoredWithStaleHopCount, "scoring should tolerate stale hop metadata");
assert.equal(
  scoredWithStaleHopCount.score,
  scoredWithRate.score,
  "route scoring should use the actual edge count instead of stale hopCount metadata",
);

const lowProfitWithoutRate = scoreRoute(path, result, {
  gasPriceWei,
});
assert(lowProfitWithoutRate, "without a token/MATIC rate, scoring should still preserve the candidate");
assert.equal(
  lowProfitWithoutRate.netProfit,
  result.profit,
  "without a token/MATIC rate, scoring must not subtract native wei from token-denominated profit",
);
assert.equal(
  lowProfitWithoutRate.gasCostInTokens,
  null,
  "without a token/MATIC rate, gas should remain unpriced instead of being compared in incompatible units",
);

const nativeLikeResult = {
  ...result,
  profit: gasCostWei + 1_000n,
};
const scoredWithoutRate = scoreRoute(path, nativeLikeResult, {
  gasPriceWei,
});
assert(scoredWithoutRate, "scoring should still work without a conversion rate when profit is native-denominated");
assert.equal(
  scoredWithoutRate.netProfit,
  nativeLikeResult.profit,
  "without a token/MATIC rate the scorer should avoid native-wei subtraction entirely",
);

assert.equal(
  scoreRoute(path, result, { gasPriceWei, tokenToMaticRate: 0n }),
  null,
  "invalid token/MATIC rates should reject scoring instead of silently comparing incompatible units",
);

assert.equal(
  estimateGasCostWei(Number.NaN, gasPriceWei),
  null,
  "gas estimation should fail closed on NaN gas values instead of throwing",
);
assert.equal(
  estimateGasCostWei(100.5, gasPriceWei),
  null,
  "gas estimation should reject fractional gas values instead of truncating or throwing",
);
assert.equal(
  estimateGasCostWei(100_000, -1n),
  null,
  "gas estimation should reject negative gas prices",
);

assert.equal(
  scoreRoute(
    path,
    {
      profitable: true,
      amountIn: 100n,
      amountOut: 120n,
      profit: 30n,
      totalGas: 100_000,
    },
    { gasPriceWei, tokenToMaticRate: 1n },
  ),
  null,
  "route scoring should reject results whose profit does not match amountOut - amountIn",
);
assert.equal(
  scoreRoute(
    path,
    {
      profitable: true,
      amountIn: 100n,
      profit: 20n,
      totalGas: Number.POSITIVE_INFINITY,
    },
    { gasPriceWei, tokenToMaticRate: 1n },
  ),
  null,
  "route scoring should reject non-finite gas estimates instead of throwing",
);
assert.equal(
  scoreRoute(path, result, { gasPriceWei: -1n }),
  null,
  "route scoring should reject negative gas prices",
);
assert.equal(
  scoreRoute(path, result, { minNetProfit: -1n }),
  null,
  "route scoring should reject negative minimum profit thresholds",
);

const hugeScored = scoreRoute(
  path,
  {
    profitable: true,
    amountIn: 1n,
    profit: 10n ** 400n,
    totalGas: 1,
  },
  { gasPriceWei, tokenToMaticRate: 1n },
);
assert(hugeScored, "very large bigint profits should still produce a ranking score");
assert(Number.isFinite(hugeScored.score), "route scoring should remain finite for huge bigint inputs");
assert(Number.isFinite(hugeScored.roi), "ROI conversion should remain finite for huge bigint inputs");

const equalGrossProfit = {
  profitable: true,
  amountIn: 10n ** 18n,
  profit: 2n * 10n ** 16n,
};
const rankedByGas = rankRoutes(
  [
    { path, result: { ...equalGrossProfit, totalGas: 400_000 } },
    { path, result: { ...equalGrossProfit, totalGas: 80_000 } },
  ],
  {
    gasPriceWei,
    tokenToMaticRate: 1n,
  },
);
assert.equal(rankedByGas.length, 2);
assert.equal(
  rankedByGas[0].result.totalGas,
  80_000,
  "when gross profit matches, the scorer should prefer the lower-gas route",
);
assert(
  rankedByGas[0].roi > rankedByGas[1].roi,
  "ROI should reflect gas-adjusted profitability when token/MATIC conversion is known",
);

console.log("Score route checks passed.");
