import assert from "node:assert/strict";

import {
  updateV3LiquidityState,
  updateV3SwapState,
} from "../src/state/watcher_state_ops.ts";
import { validatePoolState } from "../src/state/normalizer.ts";

const poolAddress = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const tokenA = "0x1111111111111111111111111111111111111111";
const tokenB = "0x2222222222222222222222222222222222222222";

function baseV3State() {
  return {
    poolId: poolAddress,
    protocol: "UNISWAP_V3",
    token0: tokenA,
    token1: tokenB,
    tokens: [tokenA, tokenB],
    sqrtPriceX96: 79228162514264337593543950336n,
    tick: 0,
    liquidity: 1_000_000n,
    tickSpacing: 60,
    ticks: new Map(),
    initialized: true,
    timestamp: 1,
  };
}

{
  const state = baseV3State();
  updateV3SwapState(
    state,
    {
      body: [
        { val: 0 },
        { val: 0 },
        { val: "79228162514264337593543950336" },
        { val: "1000000" },
        { val: "0" },
      ],
    },
    { metadata: { fee: "500" } },
  );

  assert.equal(state.fee, 500n);
  assert.equal(state.feeSource, "metadata");
  assert.equal(validatePoolState(state).valid, true);
}

{
  const state = baseV3State();
  updateV3LiquidityState(
    state,
    {
      indexed: [
        { val: "0x3333333333333333333333333333333333333333" },
        { val: "-60" },
        { val: "60" },
      ],
      body: [
        { val: "0x4444444444444444444444444444444444444444" },
        { val: "1000" },
        { val: "0" },
        { val: "0" },
      ],
    },
    true,
    { metadata: {} },
  );

  assert.equal(state.fee, 3000n);
  assert.equal(state.feeSource, "default");
  assert.equal(validatePoolState(state).valid, true);
}

console.log("Watcher V3 fee hydration checks passed.");
