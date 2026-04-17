// @ts-nocheck
/**
 * src/protocols/uniswap_v3.js — Uniswap V3 protocol definition
 */

export default {
  name: "Uniswap V3",
  address: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
  signature:
    "event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)",
  decode(decoded) {
    // indexed: [token0, token1, fee]; body: [tickSpacing, pool]
    return {
      pool_address: decoded.body[1]?.val?.toString(),
      tokens: [
        decoded.indexed[0]?.val?.toString(),
        decoded.indexed[1]?.val?.toString(),
      ],
      metadata: {
        fee: decoded.indexed[2]?.val?.toString(),
        tickSpacing: decoded.body[0]?.val?.toString(),
      },
    };
  },
};
