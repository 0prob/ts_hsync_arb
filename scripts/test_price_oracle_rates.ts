import assert from "node:assert/strict";

import { PriceOracle, TOKENS } from "../src/profit/price_oracle.ts";

const token = TOKENS.USDC;
const poolA = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const poolB = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function registryForPools(tokensByPool: Map<string, string[]>) {
  return {
    getPoolMeta(poolAddress: string) {
      const tokens = tokensByPool.get(poolAddress.toLowerCase());
      return tokens ? { tokens } : null;
    },
    getTokenMeta() {
      return null;
    },
  };
}

function v2State(rateWeiPerRawToken: bigint, timestamp: number) {
  return {
    reserve0: 1_000_000n,
    reserve1: 1_000_000n * rateWeiPerRawToken,
    timestamp,
  };
}

{
  const now = Date.now();
  const tokensByPool = new Map([
    [poolA, [token, TOKENS.WMATIC]],
    [poolB, [token, TOKENS.WMATIC]],
  ]);
  const stateCache = new Map<string, any>([
    [poolA, v2State(3n, now)],
    [poolB, v2State(2n, now)],
  ]);
  const oracle = new PriceOracle(stateCache, registryForPools(tokensByPool));

  oracle.update();

  assert.equal(
    oracle.getFreshRate(token, 60_000),
    2n,
    "same-freshness direct WMATIC pools should choose the conservative lower token/MATIC rate",
  );
}

{
  const now = Date.now();
  const tokensByPool = new Map([
    [poolA, [token, TOKENS.WMATIC]],
    [poolB, [token, TOKENS.WMATIC]],
  ]);
  const stateCache = new Map<string, any>([
    [poolA, v2State(2n, now - 10_000)],
    [poolB, v2State(3n, now)],
  ]);
  const oracle = new PriceOracle(stateCache, registryForPools(tokensByPool));

  oracle.update();

  assert.equal(
    oracle.getFreshRate(token, 60_000),
    3n,
    "newer direct WMATIC quotes should win over older quotes",
  );
}

console.log("Price oracle rate checks passed.");
