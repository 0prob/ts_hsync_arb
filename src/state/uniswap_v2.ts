
/**
 * src/state/uniswap_v2.js — Uniswap V2 / QuickSwap / SushiSwap pool state fetcher
 *
 * Fetches getReserves() for constant-product AMM pools.
 * Uses retry/backoff and concurrency throttling.
 */

import {
  isNoDataReadContractError,
  readContractWithRetry,
  throttledMap,
} from "../enrichment/rpc.ts";
import { ENRICH_CONCURRENCY } from "../config/index.ts";

// ─── ABI fragment ─────────────────────────────────────────────

const GET_RESERVES_ABI = [
  {
    name: "getReserves",
    type: "function",
    inputs: [],
    outputs: [
      { name: "reserve0", type: "uint112" },
      { name: "reserve1", type: "uint112" },
      { name: "blockTimestampLast", type: "uint32" },
    ],
    stateMutability: "view",
  },
];

// ─── Core State Fetcher ───────────────────────────────────────

/**
 * Fetch reserves for a single V2 pool.
 *
 * @param {string} poolAddress  Checksummed pair address
 * @returns {Promise<V2PoolState>}
 *
 * @typedef {Object} V2PoolState
 * @property {string}  address    Pool address
 * @property {bigint}  reserve0   Reserve of token0
 * @property {bigint}  reserve1   Reserve of token1
 * @property {number}  fetchedAt  Timestamp of fetch (ms)
 */
export async function fetchV2PoolState(poolAddress) {
  const result = await readContractWithRetry({
    address: poolAddress,
    abi: GET_RESERVES_ABI,
    functionName: "getReserves",
  });

  return {
    address: poolAddress,
    reserve0: BigInt(result[0]),
    reserve1: BigInt(result[1]),
    blockTimestampLast: Number(result[2]),
    fetchedAt: Date.now(),
  };
}

/**
 * Fetch state for multiple V2 pools in parallel.
 *
 * @param {string[]} poolAddresses  Array of pair addresses
 * @param {number} [concurrency]    Max parallel fetches
 * @returns {Promise<Map<string, V2PoolState>>}
 */
export async function fetchMultipleV2States(
  poolAddresses,
  concurrency = ENRICH_CONCURRENCY
) {
  const states = new Map();
  const noDataFailures = new Set();

  const results = await throttledMap(
    poolAddresses,
    async (addr) => {
      try {
        const state = await fetchV2PoolState(addr);
        return { addr, state, error: null };
      } catch (error) {
        if (isNoDataReadContractError(error)) {
          noDataFailures.add(addr.toLowerCase());
        }
        console.warn(`  Failed to fetch V2 state for ${addr}: ${error.message}`);
        return { addr, state: null, error };
      }
    },
    concurrency
  );

  for (const { addr, state } of results) {
    if (state) {
      states.set(addr.toLowerCase(), state);
    }
  }

  states.noDataFailures = noDataFailures;
  return states;
}
