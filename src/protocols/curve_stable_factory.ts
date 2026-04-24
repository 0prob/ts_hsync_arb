
/**
 * src/protocols/curve_stable_factory.js — Curve StableSwap Factory definition
 */

import { discoverCurveListedFactory } from "./curve_list_factory.ts";

const ZERO = "0x0000000000000000000000000000000000000000";
const FACTORY_ADDRESS = "0x722272D36ef0Da72FF51c5A65Db7b870E2e8D4ee";

function valueToString(value: any) {
  const unwrapped = value && typeof value === "object" && "val" in value ? value.val : value;
  return unwrapped?.toString?.();
}

export default {
  name: "Curve StableSwap Factory",
  address: FACTORY_ADDRESS,
  signatures: [
    "event PlainPoolDeployed(address[4] coins, uint256 A, uint256 fee, address deployer)",
    "event MetaPoolDeployed(address coin, address base_pool, uint256 A, uint256 fee, address deployer)",
  ],
  async discover({ key, registry, chainHeight }: any) {
    return discoverCurveListedFactory({
      protocolKey: key,
      protocolName: "Curve StableSwap Factory",
      factoryAddress: FACTORY_ADDRESS,
      slotCount: 4,
      registry,
      checkpointBlock: chainHeight,
      metadataForPool: () => ({
        factory: FACTORY_ADDRESS,
        variant: "stable-factory",
      }),
    });
  },
  decode(decoded: any, rawLog: any) {
    const coinsOrCoin = decoded.body[0]?.val || [];
    const isMeta = decoded.event?.name === "MetaPoolDeployed";
    return {
      pool_address: rawLog?.address?.toString?.(),
      tokens: (Array.isArray(coinsOrCoin) ? coinsOrCoin : [coinsOrCoin])
        .map(valueToString)
        .filter((t) => t && t !== ZERO),
      metadata: {
        A: decoded.body[isMeta ? 2 : 1]?.val?.toString(),
        fee: decoded.body[isMeta ? 3 : 2]?.val?.toString(),
        deployer: decoded.body[isMeta ? 4 : 3]?.val?.toString(),
        variant: isMeta ? "meta" : "plain",
        basePool: isMeta ? decoded.body[1]?.val?.toString() : undefined,
      },
    };
  },
};
