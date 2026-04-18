
/**
 * src/enrichment/curve.js — Curve on-chain enrichment
 *
 * Fetches pool tokens via the registry's get_coins() view call.
 * Uses readContractWithRetry() for automatic backoff on 429 errors.
 */

import { readContractWithRetry } from "./rpc.ts";

const ZERO = "0x0000000000000000000000000000000000000000";

const GET_COINS_ABI = [
  {
    name: "get_coins",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "_pool", type: "address" }],
    outputs: [{ name: "", type: "address[8]" }],
  },
];

/**
 * Fetch token addresses for a Curve pool via the registry.
 * Retries automatically on HTTP 429 / 5xx with exponential backoff.
 *
 * @param {string} poolAddress     Pool contract address
 * @param {string} registryAddress Curve registry that tracks this pool
 * @returns {Promise<string[]>}
 */
export async function getCurveTokens(poolAddress, registryAddress) {
  try {
    const tokens = await readContractWithRetry({
      address: registryAddress,
      abi: GET_COINS_ABI,
      functionName: "get_coins",
      args: [poolAddress],
    });
    return tokens
      .filter((t) => t !== ZERO)
      .map((t) => t.toString());
  } catch (error) {
    console.error(
      `  Error fetching Curve tokens for ${poolAddress}: ${error.message}`
    );
    return [];
  }
}
