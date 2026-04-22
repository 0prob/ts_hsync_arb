const FACTORY_ADDRESS = "0x5F1dddbf348aC2fbe22a163e30F99F9ECE3DD50a";

export default {
  name: "KyberSwap Elastic Legacy",
  address: FACTORY_ADDRESS,
  signature:
    "event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)",
  decode(decoded: any) {
    return {
      pool_address: decoded.body[1]?.val?.toString(),
      tokens: [
        decoded.indexed[0]?.val?.toString(),
        decoded.indexed[1]?.val?.toString(),
      ],
      metadata: {
        fee: decoded.indexed[2]?.val?.toString(),
        tickSpacing: decoded.body[0]?.val?.toString(),
        isAlgebra: true,
        isKyberElastic: true,
        implementationStatus: "state_only",
      },
    };
  },
};
