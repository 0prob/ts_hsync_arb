import assert from "node:assert/strict";

import { PriceOracle, TOKENS } from "../src/profit/price_oracle.ts";
import { computeProfit, roiMicroUnits } from "../src/profit/compute.ts";

const TOKEN_X = "0xtokenx";
const TOKEN_Y = "0xtokeny";
const WMATIC_USDC_POOL = "0xpool-wmatic-usdc";
const WMATIC_USDC_NATIVE_POOL = "0xpool-wmatic-usdc-native";
const TOKEN_X_USDC_POOL = "0xpool-tokenx-usdc";
const TOKEN_Y_USDC_POOL = "0xpool-tokeny-usdc";
const TOKEN_Y_USDC_NATIVE_POOL = "0xpool-tokeny-usdc-native";

const NOW = Date.now();
const OLD_TS = NOW - 20_000;
const NEW_TS = NOW - 1_000;

const registry = {
  getPoolMeta(address: string) {
    if (address === WMATIC_USDC_POOL) {
      return {
        pool_address: WMATIC_USDC_POOL,
        tokens: [TOKENS.WMATIC, TOKENS.USDC],
      };
    }
    if (address === WMATIC_USDC_NATIVE_POOL) {
      return {
        pool_address: WMATIC_USDC_NATIVE_POOL,
        tokens: [TOKENS.WMATIC, TOKENS.USDC_N],
      };
    }
    if (address === TOKEN_X_USDC_POOL) {
      return {
        pool_address: TOKEN_X_USDC_POOL,
        tokens: [TOKEN_X, TOKENS.USDC],
      };
    }
    if (address === TOKEN_Y_USDC_POOL) {
      return {
        pool_address: TOKEN_Y_USDC_POOL,
        tokens: [TOKEN_Y, TOKENS.USDC],
      };
    }
    if (address === TOKEN_Y_USDC_NATIVE_POOL) {
      return {
        pool_address: TOKEN_Y_USDC_NATIVE_POOL,
        tokens: [TOKEN_Y, TOKENS.USDC_N],
      };
    }
    return null;
  },
  getTokenMeta(address: string) {
    if (address === TOKEN_X) return { decimals: 6 };
    if (address === TOKEN_Y) return { decimals: 6 };
    return null;
  },
};

const stateCache = new Map<string, any>([
  [WMATIC_USDC_POOL, {
    reserve0: 1_000_000n * 10n ** 18n,
    reserve1: 1_000_000n * 10n ** 6n,
    timestamp: NEW_TS,
  }],
  [WMATIC_USDC_NATIVE_POOL, {
    reserve0: 2_000_000n * 10n ** 18n,
    reserve1: 1_000_000n * 10n ** 6n,
    timestamp: OLD_TS,
  }],
  [TOKEN_X_USDC_POOL, {
    reserve0: 2n * 10n ** 6n,
    reserve1: 1n * 10n ** 6n,
    timestamp: NEW_TS,
  }],
  [TOKEN_Y_USDC_POOL, {
    reserve0: 2n * 10n ** 6n,
    reserve1: 1n * 10n ** 6n,
    timestamp: NEW_TS,
  }],
  [TOKEN_Y_USDC_NATIVE_POOL, {
    reserve0: 3n * 10n ** 6n,
    reserve1: 1n * 10n ** 6n,
    timestamp: OLD_TS,
  }],
]);

const oracle = new PriceOracle(stateCache, registry);
oracle.update();

const initialRate = oracle.getFreshRate(TOKEN_X);
assert.equal(
  initialRate,
  500_000_000_000n,
  "oracle should derive indirect token rates through the freshest pivot quote on the initial full scan",
);
assert.equal(
  oracle.getRate(TOKEN_Y),
  500_000_000_000n,
  "oracle should prefer the freshest pivot path instead of the first configured pivot token",
);

stateCache.set(WMATIC_USDC_POOL, {
  reserve0: 2_000_000n * 10n ** 18n,
  reserve1: 1_000_000n * 10n ** 6n,
  timestamp: NEW_TS + 60_000,
});
oracle.update([WMATIC_USDC_POOL]);

assert.equal(
  oracle.getFreshRate(TOKEN_X),
  1_000_000_000_000n,
  "incremental oracle updates should recompute indirect token rates when a pivot pool changes",
);
assert.equal(oracle.getRate(TOKEN_Y), 1_000_000_000_000n);

const assessment = computeProfit(
  {
    amountIn: 1_000_000n,
    amountOut: 1_100_000n,
    profit: 100_000n,
    totalGas: 100_000,
    hopCount: 2,
  },
  {
    gasPriceWei: 30n * 10n ** 9n,
    tokenToMaticRate: 10n ** 12n,
    slippageBps: 0n,
    revertRiskBps: 0n,
    minNetProfit: 0n,
  },
);

assert.equal(
  assessment.netProfitAfterGas,
  97_000n,
  "computeProfit should still deduct gas in start-token units when a token/MATIC rate is available",
);
assert.equal(
  assessment.roi,
  97_000,
  "ROI should reflect net profit after gas when the route can be priced in start-token units",
);

assert(
  Number.isFinite(roiMicroUnits(10n ** 400n, 1n)),
  "ROI conversion should remain finite for very large bigint inputs",
);

console.log("Oracle/compute checks passed.");
