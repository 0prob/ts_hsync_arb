import assert from "node:assert/strict";

import { optimizeInputAmount } from "../src/routing/simulator.ts";

function makePath() {
  return {
    startToken: "0x0000000000000000000000000000000000000001",
    hopCount: 1,
    logWeight: 0,
    edges: [
      {
        poolAddress: "0xpool",
        tokenIn: "0x0000000000000000000000000000000000000001",
        tokenOut: "0x0000000000000000000000000000000000000002",
        protocol: "UNISWAP_V2",
        zeroForOne: true,
      },
    ],
  };
}

{
  const path = makePath();
  const stateCache = new Map([
    [
      "0xpool",
      {
        reserve0: 1_000_000n,
        reserve1: 2_000_000n,
        fee: 997n,
      },
    ],
  ]);

  const scoreCalls = new Map<string, number>();
  const acceptCalls = new Map<string, number>();

  const result = optimizeInputAmount(path, stateCache, {
    minAmount: 1_000n,
    maxAmount: 9_000n,
    iterations: 8,
    scorer(routeResult: { amountIn: bigint; profit: bigint }) {
      const key = routeResult.amountIn.toString();
      scoreCalls.set(key, (scoreCalls.get(key) ?? 0) + 1);
      return routeResult.profit;
    },
    accept(routeResult: { amountIn: bigint; profitable?: boolean }) {
      const key = routeResult.amountIn.toString();
      acceptCalls.set(key, (acceptCalls.get(key) ?? 0) + 1);
      return Boolean(routeResult.profitable);
    },
  });

  assert(result, "optimizer should return a profitable result for a viable v2 path");
  for (const count of scoreCalls.values()) {
    assert.equal(count, 1, "optimizer should score each probed input amount at most once");
  }
  for (const count of acceptCalls.values()) {
    assert.equal(count, 1, "optimizer should accept-check the final best amount once");
  }
}

console.log("Simulator checks passed.");
