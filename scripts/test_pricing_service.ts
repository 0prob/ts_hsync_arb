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

console.log("Pricing service checks passed.");
