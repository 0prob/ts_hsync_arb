// @ts-nocheck
/**
 * src/protocols/sushiswap_v2.js — SushiSwap V2 protocol definition
 */

export default {
  name: "SushiSwap V2",
  address: "0xc35dadb65012ec5796536bd9864ed8773abc74c4",
  signature:
    "event PairCreated(address indexed token0, address indexed token1, address pair, uint256)",
  decode(decoded) {
    return {
      pool_address: decoded.body[0]?.val?.toString(),
      tokens: [
        decoded.indexed[0]?.val?.toString(),
        decoded.indexed[1]?.val?.toString(),
      ],
      metadata: {},
    };
  },
};
