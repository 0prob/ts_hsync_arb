
/**
 * src/execution/addresses.js — Canonical contract addresses on Polygon
 *
 * All addresses are checksummed. Used by the calldata encoder to
 * determine router targets and approval targets.
 */

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
  UNISWAP_V3: UNISWAP_V3_ROUTER,
  QUICKSWAP_V3: QUICKSWAP_V3_ROUTER,
  SUSHISWAP_V3: SUSHISWAP_V3_ROUTER,
};

/**
 * Protocols that require router-based execution (no direct pool swap).
 * Currently empty as V3 is now supported directly via callback.
 */
export const ROUTER_REQUIRED_PROTOCOLS = new Set([]);

/**
 * Protocols that support direct V2 pair swap (transfer-first pattern).
 */
export const DIRECT_SWAP_PROTOCOLS = new Set([
  "QUICKSWAP_V2",
  "SUSHISWAP_V2",
  "UNISWAP_V2",
  "DFYN_V2",
]);

/**
 * Protocols that support direct V3 pool swap (callback-based payment).
 */
export const V3_SWAP_PROTOCOLS = new Set([
  "UNISWAP_V3",
  "QUICKSWAP_V3",
  "SUSHISWAP_V3",
]);

/**
 * Curve stable pool protocols — use int128 coin indices in exchange().
 * Main registry pools, factory stable pools, 3pool forks.
 */
export const CURVE_STABLE_PROTOCOLS = new Set([
  "CURVE_STABLE",
  "CURVE_MAIN",
  "CURVE_MAIN_REGISTRY",
  "CURVE_FACTORY_STABLE",
  "CURVE_STABLE_FACTORY",
  "CURVE_STABLESWAP_NG",
]);

/**
 * Curve crypto pool protocols — use uint256 coin indices in exchange().
 * Tricrypto, factory crypto pools (USDC/ETH/BTC and similar).
 */
export const CURVE_CRYPTO_PROTOCOLS = new Set([
  "CURVE_CRYPTO",
  "CURVE_FACTORY_CRYPTO",
  "CURVE_CRYPTO_FACTORY",
  "CURVE_TRICRYPTO_NG",
]);

/**
 * Balancer V2 pool protocols — use Vault.swap() for execution.
 */
export const BALANCER_PROTOCOLS = new Set([
  "BALANCER_WEIGHTED",
  "BALANCER_STABLE",
  "BALANCER_V2",
]);
