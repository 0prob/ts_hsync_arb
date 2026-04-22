import assert from "node:assert/strict";

import { decodeAbiParameters, decodeFunctionData } from "viem";

import { V3_POOL_SWAP_ABI } from "../src/execution/abi_fragments.ts";
import { encodeV3Hop } from "../src/execution/calldata.ts";

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

console.log("Executor calldata checks passed.");
