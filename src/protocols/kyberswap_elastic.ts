const FACTORY_ADDRESS = "0x5F1dddbf348aC2fbe22a163e30F99F9ECE3DD50a";

function valueToString(value: any) {
  const unwrapped = value && typeof value === "object" && "val" in value ? value.val : value;
  return unwrapped?.toString?.();
}

function feePipsFromBps(value: string | undefined) {
  if (!value) return undefined;
  try {
    return (BigInt(value) * 100n).toString();
  } catch {
    return undefined;
  }
}

export default {
  name: "KyberSwap Elastic",
  address: FACTORY_ADDRESS,
  startBlock: 0,
  capabilities: {
    discovery: true,
    routing: true,
    execution: true,
  },
  signature:
    "event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)",
  decode(decoded: any) {
    const swapFeeBps = valueToString(decoded.indexed[2]);
    return {
      pool_address: valueToString(decoded.body[1]),
      tokens: [
        valueToString(decoded.indexed[0]),
        valueToString(decoded.indexed[1]),
      ],
      metadata: {
        fee: feePipsFromBps(swapFeeBps),
        swapFeeBps,
        tickSpacing: valueToString(decoded.body[0]),
        isKyberElastic: true,
      },
    };
  },
};
