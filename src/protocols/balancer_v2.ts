
/**
 * src/protocols/balancer_v2.js — Balancer V2 protocol definition
 */

import { getBalancerTokens } from "../enrichment/balancer.ts";
import { createRpcTokenProtocol } from "./factories.ts";

export default createRpcTokenProtocol({
  name: "Balancer V2",
  address: "0xBA12222222228d8Ba445958a75a0704d566BF2C8",
  startBlock: 0,
  signature:
    "event PoolRegistered(bytes32 indexed poolId, address indexed poolAddress, uint8 specialization)",
  decode(decoded: any) {
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
  async enrichTokens(poolMeta: any) {
    return getBalancerTokens(poolMeta.metadata.poolId);
  },
});
