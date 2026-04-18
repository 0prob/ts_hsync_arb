
/**
 * src/protocols/curve_main_registry.js — Curve Main Registry protocol definition
 */

import { getCurveTokens } from "../enrichment/curve.ts";

const REGISTRY_ADDRESS = "0x094d12e5b541784701FD8d65F11fc0598FBC6332";

export default {
  name: "Curve Main Registry",
  address: REGISTRY_ADDRESS,
  signature: "event PoolAdded(address indexed pool, bytes rate_method_id)",
  decode(decoded) {
    // indexed: [pool]; body: [rate_method_id]
    return {
      pool_address: decoded.indexed[0]?.val?.toString(),
      tokens: [], // fetched via enrichTokens
      metadata: {
        rate_method_id: decoded.body[0]?.val?.toString(),
      },
    };
  },
  async enrichTokens(poolMeta) {
    return getCurveTokens(poolMeta.pool_address, REGISTRY_ADDRESS);
  },
};
