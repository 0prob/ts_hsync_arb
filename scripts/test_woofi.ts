import assert from "node:assert/strict";
import { toFunctionSelector } from "viem";

import { encodeRoute, encodeWoofiHop } from "../src/execution/calldata.ts";
import { getWoofiAmountOut, simulateWoofiSwap } from "../src/math/woofi.ts";
import { WOOFI_PROTOCOLS, isSwapExecutionProtocol } from "../src/protocols/classification.ts";
import { PROTOCOLS } from "../src/protocols/index.ts";
import { buildGraph } from "../src/routing/graph.ts";
import { simulateHop } from "../src/routing/simulator.ts";
import { rehydrateStateData } from "../src/db/registry_codec.ts";
import { normalizePoolState, validatePoolState } from "../src/state/normalizer.ts";

const ONE = 10n ** 18n;
const USDC_DEC = 10n ** 6n;
const PRICE_DEC = 10n ** 8n;
const pool = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const quote = "0x1111111111111111111111111111111111111111";
const base = "0x2222222222222222222222222222222222222222";
const router = "0x4444444444444444444444444444444444444444";
const executor = "0x3333333333333333333333333333333333333333";

assert.equal(WOOFI_PROTOCOLS.has("WOOFI"), true);
assert.equal(isSwapExecutionProtocol(" woofi "), true);
assert.equal(PROTOCOLS.WOOFI.capabilities?.routing, true);

const normalized = normalizePoolState(
  pool.toUpperCase(),
  " woofi ",
  [quote.toUpperCase(), base],
  {
    quoteToken: quote,
    quoteReserve: 1_000_000n * USDC_DEC,
    quoteDecimals: 6,
    quoteDec: USDC_DEC,
    baseStates: [
      {
        token: base,
        reserve: 1_000n * ONE,
        feeRate: 30n,
        maxGamma: ONE,
        maxNotionalSwap: 10_000_000n * USDC_DEC,
        price: 2_000n * PRICE_DEC,
        spread: 0n,
        coeff: 0n,
        feasible: true,
        baseDecimals: 18,
        quoteDecimals: 6,
        priceDecimals: 8,
        baseDec: ONE,
        quoteDec: USDC_DEC,
        priceDec: PRICE_DEC,
      },
    ],
    router,
    fetchedAt: 1,
  },
  { router, quoteToken: quote },
);

assert.ok(normalized);
assert.equal(normalized?.protocol, "WOOFI");
assert.deepEqual(validatePoolState(normalized), { valid: true });
assert.equal(normalized?.quoteToken, quote);
assert.equal(normalized?.tokens[0], quote);
assert.equal(normalized?.tokens[1], base);

{
  const baseIn = ONE;
  const quoteOut = getWoofiAmountOut(normalized, baseIn, base, quote);
  assert.equal(quoteOut, 1_999_400_000n);
  assert.equal(simulateWoofiSwap(2_000n * USDC_DEC, normalized, 0, 1).amountOut, 999_700_000_000_000_000n);
}

{
  const graph = buildGraph([
    {
      pool_address: pool,
      protocol: "WOOFI",
      tokens: [quote, base],
      metadata: { router },
      status: "active",
    },
  ], new Map([[pool, normalized]]));
  const edge = graph.getPoolEdge(pool, base, quote);
  assert.ok(edge);
  assert.equal(edge.protocolKind, "woofi");
  assert.equal(edge.feeBps, 3);
  assert.equal(simulateHop(edge, ONE, new Map()).amountOut, 1_999_400_000n);
}

{
  const hydrated = rehydrateStateData("WOOFI", {
    protocol: "WOOFI",
    fee: "30",
    quoteReserve: "1000000000000",
    balances: ["1000000000000", "1000000000000000000000"],
    baseTokenStates: {
      [base]: {
        reserve: "1000000000000000000000",
        feeRate: "30",
        maxGamma: "1000000000000000000",
        maxNotionalSwap: "10000000000000",
        price: "200000000000",
        spread: "0",
        coeff: "0",
        baseDec: "1000000000000000000",
        quoteDec: "1000000",
        priceDec: "100000000",
      },
    },
  });
  assert.equal(typeof hydrated.quoteReserve, "bigint");
  assert.equal(typeof hydrated.baseTokenStates[base].price, "bigint");
}

{
  const calls = encodeWoofiHop({
    poolAddress: pool,
    router,
    tokenIn: base,
    tokenOut: quote,
    amountIn: 1000n,
    amountOut: 900n,
  }, executor, { slippageBps: 100 });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].target.toLowerCase(), executor);
  assert.equal(calls[1].target.toLowerCase(), router);
  assert.equal(calls[1].data.slice(0, 10), toFunctionSelector("swap(address,address,uint256,uint256,address,address)"));
}

{
  const calls = encodeRoute(
    {
      path: {
        edges: [
          {
            protocol: "WOOFI",
            poolAddress: pool,
            tokenIn: base,
            tokenOut: quote,
            metadata: { router },
          },
        ],
      },
      result: {
        hopAmounts: [1000n, 900n],
      },
    },
    executor,
  );
  assert.equal(calls.length, 2);
  assert.equal(calls[1].data.slice(0, 10), toFunctionSelector("swap(address,address,uint256,uint256,address,address)"));
}

console.log("WOOFi protocol checks passed.");
