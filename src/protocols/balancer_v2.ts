// @ts-nocheck
/**
 * src/protocols/balancer_v2.js — Balancer V2 protocol definition
 */

import { getBalancerTokens } from "../enrichment/balancer.ts";

export default {
  name: "Balancer V2",
  address: "0xBA12222222228d8Ba445958a75a0704d566BF2C8",
  signature:
    "event PoolRegistered(bytes32 indexed poolId, address indexed poolAddress, uint8 specialization)",
  decode(decoded) {
    // indexed: [poolId, poolAddress]; body: [specialization]
    return {
      pool_address: decoded.indexed[1]?.val?.toString(),
      tokens: [], // fetched via enrichTokens
      metadata: {
        poolId: decoded.indexed[0]?.val?.toString(),
        specialization: decoded.body[0]?.val?.toString(),
      },
    };
  },
  async enrichTokens(poolMeta) {
    return getBalancerTokens(poolMeta.metadata.poolId);
  },
};
