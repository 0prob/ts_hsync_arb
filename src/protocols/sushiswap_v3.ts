
/**
 * src/protocols/sushiswap_v3.js — SushiSwap V3 protocol definition
 *
 * SushiSwap V3 is a direct Uniswap V3 fork on Polygon.
 * Factory address, event signature, and pool interface are identical to
 * Uniswap V3; only the factory address differs.
 *
 * Factory: 0x917933899c6a5F8E37F31E19f92CdBFF7e8FF0e2
 * Router:  0x0aF89E1620b96170e2a9D0b68fEebb767eD044c3 (SushiSwap V3 SwapRouter on Polygon)
 */

export default {
  name: "SushiSwap V3",
  address: "0x917933899c6a5F8E37F31E19f92CdBFF7e8FF0e2",
  signature:
    "event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)",
  decode(decoded: any) {
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
