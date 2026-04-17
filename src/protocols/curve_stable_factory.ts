// @ts-nocheck
/**
 * src/protocols/curve_stable_factory.js — Curve StableSwap Factory definition
 */

const ZERO = "0x0000000000000000000000000000000000000000";

export default {
  name: "Curve StableSwap Factory",
  address: "0x722272D36ef0Da72FF51c5A65Db7b870E2e8D4ee",
  signature:
    "event PoolCreated(address indexed pool, address[4] coins, uint256 A, uint256 fee, address deployer)",
  decode(decoded) {
    // indexed: [pool]; body: [coins, A, fee, deployer]
    const coins = decoded.body[0]?.val || [];
    return {
      pool_address: decoded.indexed[0]?.val?.toString(),
      tokens: (Array.isArray(coins) ? coins : [coins])
        .map((c) => c?.toString())
        .filter((t) => t && t !== ZERO),
      metadata: {
        A: decoded.body[1]?.val?.toString(),
        fee: decoded.body[2]?.val?.toString(),
        deployer: decoded.body[3]?.val?.toString(),
      },
    };
  },
};
