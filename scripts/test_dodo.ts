import assert from "node:assert/strict";
import { toFunctionSelector } from "viem";

import { encodeDodoHop, encodeRoute } from "../src/execution/calldata.ts";
import { getDodoAmountOut, simulateDodoSwap } from "../src/math/dodo.ts";
import { DODO_PROTOCOLS, isSwapExecutionProtocol } from "../src/protocols/classification.ts";
import { PROTOCOLS } from "../src/protocols/index.ts";
import { buildGraph } from "../src/routing/graph.ts";
import { simulateHop } from "../src/routing/simulator.ts";
import { normalizePoolState, validatePoolState } from "../src/state/normalizer.ts";

const ONE = 10n ** 18n;
const pool = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const tokenA = "0x1111111111111111111111111111111111111111";
const tokenB = "0x2222222222222222222222222222222222222222";
const executor = "0x3333333333333333333333333333333333333333";

assert.equal(DODO_PROTOCOLS.has("DODO_DVM"), true);
assert.equal(isSwapExecutionProtocol("dodo_dpp"), true);

{
  const decoded = PROTOCOLS.DODO_DVM.decode!({
    body: [
      { val: tokenA },
      { val: tokenB },
      { val: executor },
      { val: pool },
    ],
  });
  assert.equal(decoded.pool_address, pool);
  assert.deepEqual(decoded.tokens, [tokenA, tokenB]);
  assert.equal(decoded.metadata.poolType, "DVM");
  assert.equal(decoded.metadata.creator, executor);
}

const normalized = normalizePoolState(
  pool.toUpperCase(),
  "dodo_dvm",
  [tokenA.toUpperCase(), tokenB],
  {
    baseToken: tokenA,
    quoteToken: tokenB,
    baseReserve: 100_000n * ONE,
    quoteReserve: 100_000n * ONE,
    baseTarget: 100_000n * ONE,
    quoteTarget: 100_000n * ONE,
    i: ONE,
    k: 0n,
    rState: 0,
    lpFeeRate: 3_000_000_000_000_000n,
    mtFeeRate: 0n,
    fetchedAt: 1,
  },
  { poolType: "DVM" },
);

assert.ok(normalized);
assert.equal(normalized?.protocol, "DODO_DVM");
assert.equal(validatePoolState(normalized).valid, true);
assert.equal(normalized?.baseToken, tokenA);
assert.equal(normalized?.quoteToken, tokenB);

{
  const amountIn = 1_000n * ONE;
  const amountOut = getDodoAmountOut(normalized, amountIn, true);
  assert.equal(amountOut, 997n * ONE);
  assert.equal(simulateDodoSwap(normalized, amountIn, false).amountOut, 997n * ONE);
}

{
  const graph = buildGraph([
    {
      pool_address: pool,
      protocol: "DODO_DVM",
      tokens: [tokenA, tokenB],
      metadata: { poolType: "DVM" },
      status: "active",
    },
  ], new Map([[pool, normalized]]));
  const edge = graph.getPoolEdge(pool, tokenA, tokenB);
  assert.ok(edge);
  assert.equal(edge.protocolKind, "dodo");
  assert.equal(edge.feeBps, 30);
  assert.equal(simulateHop(edge, 1_000n * ONE, new Map()).amountOut, 997n * ONE);
}

{
  const calls = encodeDodoHop({
    poolAddress: pool,
    tokenIn: tokenA,
    tokenOut: tokenB,
    zeroForOne: true,
    amountIn: 1000n,
    amountOut: 997n,
  }, executor);

  assert.equal(calls.length, 2);
  assert.equal(calls[0].target.toLowerCase(), tokenA);
  assert.equal(calls[1].target.toLowerCase(), pool);
  assert.equal(calls[1].data.slice(0, 10), toFunctionSelector("sellBase(address)"));
}

{
  const calls = encodeRoute(
    {
      path: {
        edges: [
          {
            protocol: "DODO_DVM",
            poolAddress: pool,
            tokenIn: tokenB,
            tokenOut: tokenA,
            zeroForOne: false,
          },
        ],
      },
      result: {
        hopAmounts: [1000n, 997n],
      },
    },
    executor,
  );
  assert.equal(calls.length, 2);
  assert.equal(calls[1].data.slice(0, 10), toFunctionSelector("sellQuote(address)"));
}

console.log("DODO protocol checks passed.");
