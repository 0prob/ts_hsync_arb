
/**
 * src/protocols/curve_crypto_factory.js — Curve Crypto Factory definition
 */

import { discoverCurveListedFactory } from "./curve_list_factory.ts";

const FACTORY_ADDRESS = "0xE5De15A9C9bBedb4F5EC13B131E61245f2983A69";

function valueToString(value: any) {
  const unwrapped = value && typeof value === "object" && "val" in value ? value.val : value;
  return unwrapped?.toString?.();
}

export default {
  name: "Curve Crypto Factory",
  address: FACTORY_ADDRESS,
  signature:
    "event CryptoPoolDeployed(address token, address[2] coins, uint256 A, uint256 gamma, uint256 mid_fee, uint256 out_fee, uint256 allowed_extra_profit, uint256 fee_gamma, uint256 adjustment_step, uint256 admin_fee, uint256 ma_half_time, uint256 initial_price, address deployer)",
  async discover({ key, registry, chainHeight }: any) {
    return discoverCurveListedFactory({
      protocolKey: key,
      protocolName: "Curve Crypto Factory",
      factoryAddress: FACTORY_ADDRESS,
      slotCount: 2,
      registry,
      checkpointBlock: chainHeight,
      metadataForPool: () => ({
        factory: FACTORY_ADDRESS,
        variant: "crypto-factory",
      }),
    });
  },
  decode(decoded: any, rawLog: any) {
    const coins = decoded.body[1]?.val || [];
    return {
      pool_address: rawLog?.address?.toString?.(),
      tokens: (Array.isArray(coins) ? coins : [coins]).map((c) =>
        valueToString(c)
      ),
      metadata: {
        token: decoded.body[0]?.val?.toString(),
        A: decoded.body[2]?.val?.toString(),
        gamma: decoded.body[3]?.val?.toString(),
        mid_fee: decoded.body[4]?.val?.toString(),
        out_fee: decoded.body[5]?.val?.toString(),
        allowed_extra_profit: decoded.body[6]?.val?.toString(),
        fee_gamma: decoded.body[7]?.val?.toString(),
        adjustment_step: decoded.body[8]?.val?.toString(),
        admin_fee: decoded.body[9]?.val?.toString(),
        ma_half_time: decoded.body[10]?.val?.toString(),
        initial_price: decoded.body[11]?.val?.toString(),
        deployer: decoded.body[12]?.val?.toString(),
      },
    };
  },
};
