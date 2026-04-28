import assert from "node:assert/strict";

import {
  encodeBalancerHop,
  encodeCurveHop,
  encodeRoute,
  encodeDodoHop,
  encodeV2Hop,
  encodeV3Hop,
  encodeWoofiHop,
} from "../src/execution/calldata.ts";

const executor = "0x3333333333333333333333333333333333333333";
const pool = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const tokenA = "0x1111111111111111111111111111111111111111";
const tokenB = "0x2222222222222222222222222222222222222222";
const poolId = "0x" + "ab".repeat(32);

{
  const calls = encodeV2Hop({
    poolAddress: pool,
    tokenIn: tokenA,
    tokenOut: tokenB,
    zeroForOne: true,
    amountIn: "1000",
    amountOut: "900",
  }, executor);

  assert.equal(calls.length, 2);
  assert.match(calls[0].data, /^0x[0-9a-f]+$/i);
}

{
  const calls = encodeV3Hop({
    protocol: "UNISWAP_V3",
    poolAddress: pool,
    tokenIn: tokenA,
    tokenOut: tokenB,
    zeroForOne: true,
    fee: "3000",
    amountIn: "1000",
    amountOut: "900",
  }, executor);

  assert.equal(calls.length, 1);
  assert.match(calls[0].data, /^0x[0-9a-f]+$/i);
}

{
  const calls = encodeCurveHop({
    poolAddress: pool,
    tokenIn: tokenA,
    tokenOut: tokenB,
    tokenInIdx: 0,
    tokenOutIdx: 1,
    amountIn: "1000",
    amountOut: "900",
    isCrypto: false,
  }, executor, { slippageBps: 100 });

  assert.equal(calls.length, 2);
  assert.match(calls[1].data, /^0x[0-9a-f]+$/i);
}

{
  const calls = encodeBalancerHop({
    poolAddress: pool,
    poolId,
    tokenIn: tokenA,
    tokenOut: tokenB,
    amountIn: "1000",
    amountOut: "900",
  }, executor, { slippageBps: 100, deadline: 1_900_000_000n });

  assert.equal(calls.length, 2);
  assert.match(calls[1].data, /^0x[0-9a-f]+$/i);
}

{
  const calls = encodeRoute({
    path: {
      edges: [{
        protocol: "BALANCER_V2",
        poolAddress: pool,
        tokenIn: tokenA,
        tokenOut: tokenB,
        zeroForOne: true,
        metadata: {},
        stateRef: { balancerPoolId: poolId },
      }],
    },
    result: {
      hopAmounts: [1000n, 900n],
    },
  }, executor, { slippageBps: 100, deadline: 1_900_000_000n });

  assert.equal(calls.length, 2);
  assert.match(calls[1].data, /^0x[0-9a-f]+$/i);
}

{
  const routed = encodeRoute({
    path: {
      edges: [{
        protocol: "curve_crypto",
        poolAddress: pool,
        tokenIn: tokenA,
        tokenOut: tokenB,
        zeroForOne: true,
        tokenInIdx: 0,
        tokenOutIdx: 1,
      }],
    },
    result: {
      hopAmounts: [1000n, 900n],
    },
  }, executor, { slippageBps: 100 });
  const direct = encodeCurveHop({
    poolAddress: pool,
    tokenIn: tokenA,
    tokenOut: tokenB,
    tokenInIdx: 0,
    tokenOutIdx: 1,
    amountIn: 1000n,
    amountOut: 900n,
    isCrypto: true,
  }, executor, { slippageBps: 100 });

  assert.equal(routed[1].data.slice(0, 10), direct[1].data.slice(0, 10));
}

{
  const calls = encodeDodoHop({
    poolAddress: pool,
    tokenIn: tokenA,
    tokenOut: tokenB,
    zeroForOne: true,
    amountIn: "1000",
    amountOut: "900",
  }, executor);

  assert.equal(calls.length, 2);
  assert.match(calls[1].data, /^0x[0-9a-f]+$/i);
}

{
  const calls = encodeWoofiHop({
    router: pool,
    tokenIn: tokenA,
    tokenOut: tokenB,
    amountIn: "1000",
    amountOut: "900",
  }, executor, { slippageBps: 100 });

  assert.equal(calls.length, 2);
  assert.match(calls[1].data, /^0x[0-9a-f]+$/i);
}

assert.throws(
  () => encodeV2Hop({
    poolAddress: pool,
    tokenIn: tokenA,
    tokenOut: tokenB,
    zeroForOne: true,
    amountIn: -1n,
    amountOut: 900n,
  }, executor),
  /encodeV2Hop amountIn/,
);

assert.throws(
  () => encodeV3Hop({
    protocol: "UNISWAP_V3",
    poolAddress: pool,
    tokenIn: tokenA,
    tokenOut: tokenB,
    zeroForOne: true,
    fee: 16_777_216n,
    amountIn: 1000n,
    amountOut: 900n,
  }, executor),
  /fee must fit uint24/,
);

assert.throws(
  () => encodeCurveHop({
    poolAddress: pool,
    tokenIn: tokenA,
    tokenOut: tokenB,
    tokenInIdx: 0,
    tokenOutIdx: 1,
    amountIn: 1000n,
    amountOut: 900n,
    isCrypto: false,
  }, executor, { slippageBps: 10_001 }),
  /slippageBps/,
);

assert.throws(
  () => encodeBalancerHop({
    poolAddress: pool,
    poolId,
    tokenIn: tokenA,
    tokenOut: tokenB,
    amountIn: 1000n,
    amountOut: -1n,
  }, executor, { slippageBps: 100, deadline: 1_900_000_000n }),
  /amountOut/,
);

console.log("ABI calldata checks passed.");
