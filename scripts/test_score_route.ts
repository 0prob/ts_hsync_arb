import assert from "node:assert/strict";

import { estimateGasCostWei, gasCostInStartTokenUnits, scoreRoute } from "../src/routing/score_route.ts";

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

const lowProfitWithoutRate = scoreRoute(path, result, {
  gasPriceWei,
});
assert.equal(
  lowProfitWithoutRate,
  null,
  "without a token/MATIC rate, fallback wei math may reject a non-native-token route",
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
  nativeLikeResult.profit - gasCostWei,
  "without a token/MATIC rate the scorer should fall back to raw wei math",
);

assert.equal(
  scoreRoute(path, result, { gasPriceWei, tokenToMaticRate: 0n }),
  null,
  "invalid token/MATIC rates should reject scoring instead of silently comparing incompatible units",
);

console.log("Score route checks passed.");
