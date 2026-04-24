import assert from "node:assert/strict";

import { encodeCurveHop } from "../src/execution/calldata.ts";
import { edgeSpotLogWeight } from "../src/routing/finder.ts";
import { simulateHop } from "../src/routing/simulator.ts";

const ONE = 10n ** 18n;

{
  const edge = {
    protocol: "BALANCER_V2",
    protocolKind: "balancer",
    poolAddress: "0xpool",
    tokenIn: "0x0000000000000000000000000000000000000003",
    tokenOut: "0x0000000000000000000000000000000000000002",
    zeroForOne: true,
    stateRef: {
      poolId: "0x1111111111111111111111111111111111111111",
      protocol: "BALANCER_V2",
      tokens: [
        "0x0000000000000000000000000000000000000001",
        "0x0000000000000000000000000000000000000002",
        "0x0000000000000000000000000000000000000003",
      ],
      balances: [1_000n * ONE, 1_200n * ONE, 800n * ONE],
      weights: [ONE / 3n, ONE / 3n, ONE - 2n * (ONE / 3n)],
      swapFee: 3_000_000_000_000_000n,
      timestamp: Date.now(),
    },
  };

  const sim = simulateHop(edge, ONE, new Map());
  assert.equal(
    sim.amountOut > 0n,
    true,
    "Balancer simulation should derive token indexes from canonical state tokens instead of falling back to zeroForOne defaults",
  );
  assert.equal(
    edgeSpotLogWeight(edge) != null,
    true,
    "Balancer quote weighting should also resolve token indexes from canonical state tokens for multi-token pools",
  );
}

{
  const edge = {
    protocol: "CURVE_MAIN",
    poolAddress: "0xpool",
    tokenIn: "0x00000000000000000000000000000000000000aa",
    tokenOut: "0x00000000000000000000000000000000000000bb",
    zeroForOne: true,
    stateRef: {
      poolId: "0x1111111111111111111111111111111111111111",
      protocol: "CURVE_MAIN",
      tokens: [
        "0x0000000000000000000000000000000000000001",
        "0x0000000000000000000000000000000000000002",
        "0x0000000000000000000000000000000000000003",
      ],
      balances: [1_000n, 2_000n, 3_000n],
      rates: [ONE, ONE, ONE],
      A: 100n,
      fee: 4_000_000n,
      timestamp: Date.now(),
    },
  };

  assert.deepEqual(
    simulateHop(edge, 100n, new Map()),
    { amountOut: 0n, gasEstimate: 0 },
    "multi-token swap simulation should fail closed when token addresses cannot be resolved to canonical indexes",
  );
  assert.equal(
    edgeSpotLogWeight(edge),
    null,
    "multi-token quote weighting should also fail closed when swap token indexes cannot be resolved",
  );
}

assert.throws(
  () =>
    encodeCurveHop(
      {
        poolAddress: "0x00000000000000000000000000000000000000cc",
        tokenIn: "0x0000000000000000000000000000000000000003",
        tokenOut: "0x0000000000000000000000000000000000000004",
        amountIn: 123n,
        amountOut: 100n,
        isCrypto: false,
      },
      "0x00000000000000000000000000000000000000bb",
    ),
  /tokenInIdx required/,
  "Curve calldata encoding should fail loudly when token indexes are missing instead of encoding a wrong fallback coin pair",
);

console.log("Swap checks passed.");
