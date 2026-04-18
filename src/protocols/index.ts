
/**
 * src/protocols/index.js — Protocol registry
 *
 * Aggregates all protocol definitions into a single PROTOCOLS map.
 * Each protocol defines: name, address, signature, decode(), and
 * optionally enrichTokens().
 */

import QUICKSWAP_V2 from "./quickswap_v2.ts";
import SUSHISWAP_V2 from "./sushiswap_v2.ts";
import UNISWAP_V3 from "./uniswap_v3.ts";
import QUICKSWAP_V3 from "./quickswap_v3.ts";
import SUSHISWAP_V3 from "./sushiswap_v3.ts";
import BALANCER_V2 from "./balancer_v2.ts";
import CURVE_MAIN_REGISTRY from "./curve_main_registry.ts";
import CURVE_STABLE_FACTORY from "./curve_stable_factory.ts";
import CURVE_CRYPTO_FACTORY from "./curve_crypto_factory.ts";

export const PROTOCOLS = {
  QUICKSWAP_V2,
  SUSHISWAP_V2,
  UNISWAP_V3,
  QUICKSWAP_V3,
  SUSHISWAP_V3,
  BALANCER_V2,
  CURVE_MAIN_REGISTRY,
  CURVE_STABLE_FACTORY,
  CURVE_CRYPTO_FACTORY,
};

/**
 * Curve PoolRemoved lifecycle event definition.
 * Used to mark pools as removed in the registry.
 */
export const CURVE_POOL_REMOVED = {
  name: "Curve PoolRemoved",
  address: "0x094d12e5b541784701FD8d65F11fc0598FBC6332",
  signature: "event PoolRemoved(address indexed pool)",
};
