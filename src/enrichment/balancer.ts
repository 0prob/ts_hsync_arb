
/**
 * src/enrichment/balancer.js — Balancer V2 on-chain enrichment
 *
 * Fetches pool tokens via the Vault's getPoolTokens() view call.
 * Uses readContractWithRetry() for automatic backoff on 429 errors.
 */

import { isNoDataReadContractError, readContractWithRetry } from "./rpc.ts";

const VAULT_ADDRESS = "0xBA12222222228d8Ba445958a75a0704d566BF2C8";

const GET_POOL_TOKENS_ABI = [
  {
    name: "getPoolTokens",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "poolId", type: "bytes32" }],
    outputs: [
      { name: "tokens", type: "address[]" },
      { name: "balances", type: "uint256[]" },
      { name: "lastChangeBlock", type: "uint256" },
    ],
  },
];

/**
 * Fetch token addresses for a Balancer pool by its poolId.
 * Retries automatically on HTTP 429 / 5xx with exponential backoff.
 *
 * @param {string} poolId  The 32-byte Balancer pool ID
 * @returns {Promise<string[]>}
 */
export async function getBalancerTokens(poolId: any) {
  try {
    const [tokens] = await readContractWithRetry({
      address: VAULT_ADDRESS,
      abi: GET_POOL_TOKENS_ABI,
      functionName: "getPoolTokens",
      args: [poolId],
    });
    return (tokens as any[]).map((t: any) => t.toString());
  } catch (error: any) {
    if (isNoDataReadContractError(error)) {
      console.error(
        `  Balancer vault returned no token data for poolId ${poolId}: ${error.message}`
      );
      return [];
    }
    console.error(
      `  Error fetching Balancer tokens for poolId ${poolId}: ${error.message}`
    );
    throw error;
  }
}
