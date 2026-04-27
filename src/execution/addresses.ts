
/**
 * src/execution/addresses.js — Canonical contract addresses on Polygon
 *
 * All addresses are checksummed. Used by the calldata encoder to
 * determine router targets and approval targets.
 */

import { WOOFI_ROUTER_V2, WOOFI_WOOPP_V2 } from "../protocols/woofi.ts";

export {
  BALANCER_PROTOCOLS,
  CURVE_CRYPTO_PROTOCOLS,
  CURVE_STABLE_PROTOCOLS,
  DODO_PROTOCOLS,
  V2_PROTOCOLS as DIRECT_SWAP_PROTOCOLS,
  V3_PROTOCOLS as V3_SWAP_PROTOCOLS,
  WOOFI_PROTOCOLS,
} from "../protocols/classification.ts";
export { WOOFI_ROUTER_V2, WOOFI_WOOPP_V2 };

// ─── Flash Loan Providers ─────────────────────────────────────

/** Balancer V2 Vault — flash loan source (fee = 0) AND swap router */
export const BALANCER_VAULT = "0xBA12222222228d8Ba445958a75a0704d566BF2C8";

// ─── DEX Routers ──────────────────────────────────────────────

/** Uniswap V3 SwapRouter02 on Polygon */
export const UNISWAP_V3_ROUTER = "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45";

/** QuickSwap V2 Router02 on Polygon */
export const QUICKSWAP_V2_ROUTER = "0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff";

/** SushiSwap Router on Polygon */
export const SUSHISWAP_ROUTER = "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506";

/** DFYN Router on Polygon */
export const DFYN_ROUTER = "0xA102072A4C07F06EC3B4900FDC4C7B80b6c57429";

/** ComethSwap Router on Polygon */
export const COMETHSWAP_ROUTER = "0x93bcDc45f7e62f89a8e901DC4A0E2c6C427D9F25";

/** QuickSwap V3 (Algebra) SwapRouter on Polygon */
export const QUICKSWAP_V3_ROUTER = "0xf5b509bB0909a69B1c207E495f687a596C168E12";

/** SushiSwap V3 SwapRouter on Polygon */
export const SUSHISWAP_V3_ROUTER = "0x0aF89E1620b96170e2a9D0b68fEebb767eD044c3";

// ─── DEX Factories ────────────────────────────────────────────

/** QuickSwap V2 Factory */
export const QUICKSWAP_V2_FACTORY = "0x5757371414417b8C6CAad45bAeF941aBc7d3Ab32";

/** SushiSwap Factory */
export const SUSHISWAP_FACTORY = "0xc35DADB65012eC5796536bD9864eD8773aBc74C4";

/** DFYN V2 Factory */
export const DFYN_FACTORY = "0xE7Fb3e833eFE5F9c441105EB65Ef8b261266423B";

/** ComethSwap V2 Factory */
export const COMETHSWAP_FACTORY = "0x800b052609c355cA8103E06F022aA30647eAd60a";

/** Uniswap V3 Factory on Polygon */
export const UNISWAP_V3_FACTORY = "0x1F98431c8aD98523631AE4a59f267346ea31F984";

// ─── Protocol → Router mapping ────────────────────────────────

/**
 * Maps protocol identifiers to their router addresses.
 * V2 protocols don't strictly need a router (we use direct pair.swap),
 * but we include them for optional router-based execution.
 */
export const PROTOCOL_ROUTERS = {
  QUICKSWAP_V2: QUICKSWAP_V2_ROUTER,
  SUSHISWAP_V2: SUSHISWAP_ROUTER,
  DFYN_V2: DFYN_ROUTER,
  COMETHSWAP_V2: COMETHSWAP_ROUTER,
  UNISWAP_V3: UNISWAP_V3_ROUTER,
  QUICKSWAP_V3: QUICKSWAP_V3_ROUTER,
  SUSHISWAP_V3: SUSHISWAP_V3_ROUTER,
  WOOFI: WOOFI_ROUTER_V2,
};

/**
 * Protocols that require router-based execution (no direct pool swap).
 * Currently empty as V3 is now supported directly via callback.
 */
export const ROUTER_REQUIRED_PROTOCOLS = new Set([]);
