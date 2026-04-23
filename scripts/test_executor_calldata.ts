import assert from "node:assert/strict";

import { decodeAbiParameters, decodeFunctionData } from "viem";

import {
  BALANCER_VAULT_SWAP_ABI,
  CURVE_EXCHANGE_INT128_ABI,
  EXECUTOR_APPROVE_IF_NEEDED_ABI,
  V3_POOL_SWAP_ABI,
} from "../src/execution/abi_fragments.ts";
import { encodeBalancerHop, encodeCurveHop, encodeV3Hop } from "../src/execution/calldata.ts";

const callbackTuple = [{
  type: "tuple",
  components: [
    { name: "protocolId", type: "uint8" },
    { name: "token0", type: "address" },
    { name: "token1", type: "address" },
    { name: "fee", type: "uint24" },
  ],
}] as const;

{
  const calls = encodeV3Hop(
    {
      protocol: "UNISWAP_V3",
      poolAddress: "0x00000000000000000000000000000000000000aa",
      tokenIn: "0x0000000000000000000000000000000000000001",
      tokenOut: "0x0000000000000000000000000000000000000002",
      zeroForOne: true,
      amountIn: 123n,
      amountOut: 100n,
      fee: 3000,
    },
    "0x00000000000000000000000000000000000000bb",
  );

  const decoded: any = decodeFunctionData({
    abi: V3_POOL_SWAP_ABI,
    data: calls[0].data as `0x${string}`,
  });
  const [callback] = decodeAbiParameters(callbackTuple, decoded.args[4]);

  assert.equal(callback.protocolId, 1);
  assert.equal(callback.token0.toLowerCase(), "0x0000000000000000000000000000000000000001");
  assert.equal(callback.token1.toLowerCase(), "0x0000000000000000000000000000000000000002");
  assert.equal(callback.fee, 3000);
}

{
  const calls = encodeV3Hop(
    {
      protocol: "QUICKSWAP_V3",
      poolAddress: "0x00000000000000000000000000000000000000aa",
      tokenIn: "0x0000000000000000000000000000000000000002",
      tokenOut: "0x0000000000000000000000000000000000000001",
      zeroForOne: false,
      amountIn: 123n,
      amountOut: 100n,
      fee: 0,
    },
    "0x00000000000000000000000000000000000000bb",
  );

  const decoded: any = decodeFunctionData({
    abi: V3_POOL_SWAP_ABI,
    data: calls[0].data as `0x${string}`,
  });
  const [callback] = decodeAbiParameters(callbackTuple, decoded.args[4]);

  assert.equal(callback.protocolId, 3);
  assert.equal(callback.token0.toLowerCase(), "0x0000000000000000000000000000000000000001");
  assert.equal(callback.token1.toLowerCase(), "0x0000000000000000000000000000000000000002");
  assert.equal(callback.fee, 0);
}

{
  const executor = "0x00000000000000000000000000000000000000bb";
  const pool = "0x00000000000000000000000000000000000000cc";
  const tokenIn = "0x0000000000000000000000000000000000000003";
  const calls = encodeCurveHop(
    {
      poolAddress: pool,
      tokenIn,
      tokenOut: "0x0000000000000000000000000000000000000004",
      amountIn: 123n,
      amountOut: 100n,
      tokenInIdx: 0,
      tokenOutIdx: 1,
      isCrypto: false,
    },
    executor,
  );

  const approve: any = decodeFunctionData({
    abi: EXECUTOR_APPROVE_IF_NEEDED_ABI,
    data: calls[0].data as `0x${string}`,
  });
  assert.equal(calls[0].target.toLowerCase(), executor.toLowerCase());
  assert.equal(approve.functionName, "approveIfNeeded");
  assert.equal(approve.args[0].toLowerCase(), tokenIn.toLowerCase());
  assert.equal(approve.args[1].toLowerCase(), pool.toLowerCase());
  assert.equal(approve.args[2], 123n);

  const exchange: any = decodeFunctionData({
    abi: CURVE_EXCHANGE_INT128_ABI,
    data: calls[1].data as `0x${string}`,
  });
  assert.equal(exchange.functionName, "exchange");
}

{
  const executor = "0x00000000000000000000000000000000000000bb";
  const tokenIn = "0x0000000000000000000000000000000000000005";
  const tokenOut = "0x0000000000000000000000000000000000000006";
  const calls = encodeBalancerHop(
    {
      poolAddress: "0x00000000000000000000000000000000000000dd",
      tokenIn,
      tokenOut,
      amountIn: 555n,
      amountOut: 444n,
      poolId: "0x" + "11".repeat(32),
    },
    executor,
    { deadline: 1234n },
  );

  const approve: any = decodeFunctionData({
    abi: EXECUTOR_APPROVE_IF_NEEDED_ABI,
    data: calls[0].data as `0x${string}`,
  });
  assert.equal(calls[0].target.toLowerCase(), executor.toLowerCase());
  assert.equal(approve.functionName, "approveIfNeeded");
  assert.equal(approve.args[0].toLowerCase(), tokenIn.toLowerCase());

  const swap: any = decodeFunctionData({
    abi: BALANCER_VAULT_SWAP_ABI,
    data: calls[1].data as `0x${string}`,
  });
  assert.equal(swap.functionName, "swap");
  assert.equal(swap.args[1].sender.toLowerCase(), executor.toLowerCase());
  assert.equal(swap.args[1].recipient.toLowerCase(), executor.toLowerCase());
  assert.equal(swap.args[0].assetIn.toLowerCase(), tokenIn.toLowerCase());
  assert.equal(swap.args[0].assetOut.toLowerCase(), tokenOut.toLowerCase());
}

console.log("Executor calldata checks passed.");
