import assert from "node:assert/strict";
import { getBalancerTokens } from "../src/enrichment/balancer.ts";
import { getCurveTokens } from "../src/enrichment/curve.ts";

assert.deepEqual(
  await getBalancerTokens("0xpoolid", async () => [
    [
      "0x1111111111111111111111111111111111111111",
      { bad: "shape" },
      " 0x2222222222222222222222222222222222222222 ",
      "not-an-address",
    ],
    [],
    0n,
  ]),
  [
    "0x1111111111111111111111111111111111111111",
    "0x2222222222222222222222222222222222222222",
  ],
  "balancer enrichment should reject malformed any-typed token results instead of stringifying them",
);

assert.deepEqual(
  await getCurveTokens(
    "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    async () => [
      "0x3333333333333333333333333333333333333333",
      "0x0000000000000000000000000000000000000000",
      ["bad"],
      " 0x4444444444444444444444444444444444444444 ",
      "garbage",
    ],
  ),
  [
    "0x3333333333333333333333333333333333333333",
    "0x4444444444444444444444444444444444444444",
  ],
  "curve enrichment should reject malformed any-typed token results and zero addresses",
);

console.log("Any boundary checks passed.");
