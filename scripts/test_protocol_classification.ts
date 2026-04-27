import assert from "node:assert/strict";
import { toFunctionSelector } from "viem";

import { V3_SWAP_PROTOCOLS } from "../src/execution/addresses.ts";
import { encodeRoute } from "../src/execution/calldata.ts";
import {
  DODO_PROTOCOLS,
  isSwapExecutionProtocol,
  normalizeProtocolKey,
  V3_PROTOCOLS,
  WOOFI_PROTOCOLS,
} from "../src/protocols/classification.ts";
import { PROTOCOLS } from "../src/protocols/index.ts";
import { rehydrateStateData } from "../src/db/registry_codec.ts";
import { normalizePoolState } from "../src/state/normalizer.ts";

const pool = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const tokenA = "0x1111111111111111111111111111111111111111";
const tokenB = "0x2222222222222222222222222222222222222222";
const executor = "0x3333333333333333333333333333333333333333";

assert.equal(normalizeProtocolKey(" kyberswap_elastic "), "KYBERSWAP_ELASTIC");
assert.equal(V3_PROTOCOLS.has("KYBERSWAP_ELASTIC"), true);
assert.equal(V3_SWAP_PROTOCOLS.has("KYBERSWAP_ELASTIC"), true);
assert.equal(isSwapExecutionProtocol(" kyberswap_elastic "), true);
assert.equal(DODO_PROTOCOLS.has("DODO_DVM"), true);
assert.equal(isSwapExecutionProtocol(" dodo_dsp "), true);
assert.equal(WOOFI_PROTOCOLS.has("WOOFI"), true);
assert.equal(isSwapExecutionProtocol(" woofi "), true);
assert.deepEqual(PROTOCOLS.KYBERSWAP_ELASTIC.capabilities, {
  discovery: true,
  routing: true,
  execution: true,
});

{
  const decoded = PROTOCOLS.KYBERSWAP_ELASTIC.decode!({
    indexed: [{ val: tokenA }, { val: tokenB }, { val: 30 }],
    body: [{ val: 60 }, { val: pool }],
  });
  assert.equal(decoded.pool_address, pool);
  assert.deepEqual(decoded.tokens, [tokenA, tokenB]);
  assert.equal(decoded.metadata.fee, "3000");
  assert.equal(decoded.metadata.swapFeeBps, "30");
  assert.equal(decoded.metadata.tickSpacing, "60");
  assert.equal(decoded.metadata.isKyberElastic, true);
}

{
  const state = rehydrateStateData("KYBERSWAP_ELASTIC", {
    fee: "3000",
    sqrtPriceX96: "79228162514264337593543950336",
    liquidity: "1000000",
    ticks: { "0": { liquidityGross: "1000000", liquidityNet: "0" } },
  });
  assert.equal(typeof state.fee, "bigint", "Kyber Elastic state should rehydrate as a V3-family state");
  assert.equal(state.ticks instanceof Map, true, "Kyber Elastic ticks should rehydrate to a Map");
}

{
  const normalized = normalizePoolState(
    pool.toUpperCase(),
    " kyberswap_elastic ",
    [tokenA.toUpperCase(), tokenB],
    {
      fee: 3000n,
      swapFeeBps: 30n,
      sqrtPriceX96: 79228162514264337593543950336n,
      tick: 0,
      liquidity: 1_000_000n,
      tickSpacing: 60,
      ticks: new Map(),
      fetchedAt: 1,
    },
  );
  assert.equal(normalized?.protocol, "KYBERSWAP_ELASTIC");
  assert.equal(normalized?.isKyberElastic, true);
  assert.equal(normalized?.fee, 3000n);
  assert.equal(normalized?.swapFeeBps, 30n);
  assert.equal(normalized?.poolId, pool, "state normalization should canonicalize pool addresses");
  assert.deepEqual(
    normalized?.tokens,
    [tokenA, tokenB],
    "state normalization should canonicalize token addresses before validation",
  );
}

assert.equal(
  normalizePoolState(
    "0xnotapool",
    " kyberswap_elastic ",
    [tokenA, tokenB],
    {
      fee: 3000n,
      sqrtPriceX96: 79228162514264337593543950336n,
      tick: 0,
      liquidity: 1_000_000n,
      tickSpacing: 60,
      ticks: new Map(),
      fetchedAt: 1,
    },
  ),
  null,
  "invalid pool addresses should be rejected without throwing",
);

assert.equal(
  normalizePoolState(
    pool,
    " kyberswap_elastic ",
    [tokenA, "0xnotatoken"],
    {
      fee: 3000n,
      sqrtPriceX96: 79228162514264337593543950336n,
      tick: 0,
      liquidity: 1_000_000n,
      tickSpacing: 60,
      ticks: new Map(),
      fetchedAt: 1,
    },
  ),
  null,
  "invalid token addresses should be rejected without throwing",
);

{
  const calls = encodeRoute(
    {
      path: {
        edges: [
          {
            protocol: " kyberswap_elastic ",
            poolAddress: pool,
            tokenIn: tokenA,
            tokenOut: tokenB,
            zeroForOne: true,
            fee: 3000,
          },
        ],
      },
      result: {
        hopAmounts: [1000n, 990n],
      },
    },
    executor,
  );
  assert.equal(calls.length, 1, "Kyber Elastic should use direct V3 swap encoding");
  assert.equal(calls[0].target.toLowerCase(), pool);
  assert.equal(
    calls[0].data.slice(0, 10),
    toFunctionSelector("swap(address,int256,bool,uint160,bytes)"),
    "Kyber Elastic should use its native pool swap ABI, not the Uniswap V3 argument order",
  );
  assert.notEqual(
    calls[0].data.slice(0, 10),
    toFunctionSelector("swap(address,bool,int256,uint160,bytes)"),
  );
}

console.log("Protocol classification checks passed.");
