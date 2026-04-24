import assert from "node:assert/strict";

import { createPricingService } from "../src/runtime/pricing_service.ts";

const TOKEN = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const UNKNOWN = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

let oracle: {
  fromMatic: (tokenAddress: string, maticWei: bigint) => bigint;
  getFreshRate: (tokenAddress: string, maxAgeMs?: number) => bigint;
} | null = {
  fromMatic: (_tokenAddress: string, maticWei: bigint) => maticWei / 10n ** 12n,
  getFreshRate: (_tokenAddress: string, maxAgeMs?: number) => maxAgeMs === 30_000 ? 10n ** 12n : 0n,
};

const pricing = createPricingService({
  getTokenMeta(tokenAddress: string) {
    if (tokenAddress.toLowerCase() === TOKEN) {
      return { decimals: 6, symbol: "USDC" };
    }
    return null;
  },
  getPriceOracle: () => oracle,
  maxPriceAgeMs: 30_000,
  minProbeAmount: 1_000n,
  testAmountWei: 10n ** 18n,
});

assert.equal(
  pricing.getFreshTokenToMaticRate(TOKEN),
  10n ** 12n,
  "pricing service should delegate fresh-rate lookups through the configured oracle boundary",
);

assert.deepEqual(
  pricing.getProbeAmountsForToken(TOKEN),
  [
    1_000n,
    50_000n,
    100_000n,
    500_000n,
    1_000_000n,
    2_000_000n,
    10_000_000n,
    100_000_000n,
    1_000_000_000n,
    10n ** 18n,
  ],
  "pricing service should merge decimal-scaled and oracle-scaled probe amounts into one canonical set",
);

assert.equal(pricing.fmtSym(TOKEN), "USDC");
assert.equal(pricing.fmtSym(UNKNOWN), "BBBBBB");
assert.equal(
  pricing.fmtProfit(12_345_678n, TOKEN),
  "12.345678 USDC",
  "pricing service should format token-denominated profit from registry metadata",
);
assert.equal(
  pricing.fmtProfit(12_345_678_000_000_000n, UNKNOWN),
  "0.012345 BBBBBB",
  "pricing service should fall back to 18 decimals and address-derived symbols when metadata is absent",
);

oracle = null;
assert.equal(
  pricing.getFreshTokenToMaticRate(TOKEN),
  0n,
  "pricing service should degrade safely when the oracle subsystem is unavailable",
);
assert.deepEqual(
  pricing.getProbeAmountsForToken(TOKEN),
  [1_000n, 100_000n, 1_000_000n, 10_000_000n, 100_000_000n, 1_000_000_000n, 10n ** 18n],
  "pricing service should still produce deterministic decimal-based probes when the oracle is unavailable",
);

const malformedPricing = createPricingService({
  getTokenMeta(tokenAddress: string) {
    if (tokenAddress.toLowerCase() === TOKEN) {
      return { decimals: 6.8, symbol: "USDC" };
    }
    return { decimals: Number.NaN, symbol: null };
  },
  getPriceOracle: () => ({
    fromMatic: (_tokenAddress: string, maticWei: bigint) => {
      if (maticWei === 5n * 10n ** 16n) return -1n;
      return "bad-probe" as unknown as bigint;
    },
    getFreshRate: () => -5n as bigint,
  }),
  maxPriceAgeMs: 30_000,
  minProbeAmount: 1_000n,
  testAmountWei: 10n ** 18n,
});

assert.equal(
  malformedPricing.getFreshTokenToMaticRate(TOKEN),
  0n,
  "pricing service should reject malformed oracle rates instead of leaking negative values",
);
assert.deepEqual(
  malformedPricing.getProbeAmountsForToken(TOKEN),
  [1_000n, 100_000n, 1_000_000n, 10_000_000n, 100_000_000n, 1_000_000_000n, 10n ** 18n],
  "pricing service should ignore malformed oracle probes and truncate non-integer decimals safely",
);
assert.deepEqual(
  malformedPricing.getProbeAmountsForToken(UNKNOWN),
  [1_000n, 10n ** 17n, 10n ** 18n, 10n ** 19n, 10n ** 20n, 10n ** 21n],
  "pricing service should fall back to sane 18-decimal probe sizing when token metadata is malformed",
);

const malformedProbeFloorPricing = createPricingService({
  getTokenMeta() {
    return { decimals: 0, symbol: "ZERO" };
  },
  getPriceOracle: () => ({
    fromMatic: () => 0n,
    getFreshRate: () => 1n,
  }),
  maxPriceAgeMs: 30_000,
  minProbeAmount: 0n as bigint,
  testAmountWei: -5n as bigint,
});

assert.deepEqual(
  malformedProbeFloorPricing.getProbeAmountsForToken(TOKEN),
  [1n, 10n, 100n, 1_000n],
  "pricing service should clamp malformed probe floors to strictly positive probes instead of emitting 0 or negative runs",
);

console.log("Pricing service checks passed.");
