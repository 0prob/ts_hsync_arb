
/**
 * src/protocols/quickswap_v2.js — QuickSwap V2 protocol definition
 */

export default {
  name: "QuickSwap V2",
  address: "0x5757371414417b8C6CAad45bAeF941aBc7d3Ab32",
  signature:
    "event PairCreated(address indexed token0, address indexed token1, address pair, uint256)",
  decode(decoded) {
    // indexed[0]=token0, indexed[1]=token1; body[0]=pair, body[1]=allPairsLength
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
