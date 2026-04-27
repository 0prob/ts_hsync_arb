
/**
 * src/state/uniswap_v2.ts — Uniswap V2 / QuickSwap / SushiSwap pool state fetcher
 *
 * Fetches getReserves() for constant-product AMM pools.
 * Uses retry/backoff and concurrency throttling.
 */

import {
  isNoDataReadContractError,
  multicallWithRetry,
  readContractWithRetry,
  throttledMap,
} from "../enrichment/rpc.ts";
import { ENRICH_CONCURRENCY, V2_RESERVES_MULTICALL_CHUNK_SIZE } from "../config/index.ts";

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

type V2ReserveFetchDeps = {
  multicall?: typeof multicallWithRetry;
};

function normalizeV2PoolAddress(value: any) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function chunk<T>(items: T[], size: number) {
  const normalizedSize = Math.max(1, Math.floor(Number(size) || 1));
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += normalizedSize) {
    chunks.push(items.slice(i, i + normalizedSize));
  }
  return chunks;
}

function normalizeV2MulticallResult(poolAddress: string, result: any) {
  if (!result || result.status !== "success") return null;
  const reserves = result.result;
  if (!Array.isArray(reserves) || reserves.length < 3) return null;
  return {
    address: poolAddress,
    reserve0: BigInt(reserves[0]),
    reserve1: BigInt(reserves[1]),
    blockTimestampLast: Number(reserves[2]),
    fetchedAt: Date.now(),
  };
}

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
export async function fetchV2PoolState(poolAddress: any) {
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
  poolAddresses: any,
  concurrency = ENRICH_CONCURRENCY
) {
  return fetchMultipleV2StatesWithDeps(poolAddresses, concurrency);
}

export async function fetchMultipleV2StatesWithDeps(
  poolAddresses: any,
  concurrency = ENRICH_CONCURRENCY,
  deps: V2ReserveFetchDeps = {},
) {
  const states: Map<string, any> & { noDataFailures?: Set<string> } = new Map();
  const noDataFailures = new Set<string>();
  const addresses = Array.isArray(poolAddresses)
    ? [...new Set(poolAddresses.map(normalizeV2PoolAddress).filter(Boolean))]
    : [];
  if (addresses.length === 0) {
    states.noDataFailures = noDataFailures;
    return states;
  }

  const multicall = deps.multicall ?? multicallWithRetry;
  const chunkSize = Math.max(1, Math.floor(V2_RESERVES_MULTICALL_CHUNK_SIZE));
  const batches = chunk(addresses, chunkSize);
  const batchConcurrency = Math.max(1, Math.min(Math.floor(Number(concurrency) || 1), 3, batches.length));
  let failedCalls = 0;
  let failedBatches = 0;

  await throttledMap(
    batches,
    async (batch) => {
      const contracts = batch.map((addr) => ({
        address: addr,
        abi: GET_RESERVES_ABI,
        functionName: "getReserves",
      }));

      let results: any[];
      try {
        results = await multicall({
          contracts,
          allowFailure: true,
        });
      } catch (error: any) {
        failedBatches++;
        failedCalls += batch.length;
        console.warn(`  Failed to fetch V2 reserve multicall batch (${batch.length} pools): ${error.message}`);
        return;
      }

      for (let i = 0; i < batch.length; i++) {
        const addr = batch[i];
        const result = results[i];
        const state = normalizeV2MulticallResult(addr, result);
        if (state) {
          states.set(addr, state);
          continue;
        }

        failedCalls++;
        if (isNoDataReadContractError(result?.error)) {
          noDataFailures.add(addr);
        }
      }
    },
    batchConcurrency
  );

  if (failedCalls > 0) {
    console.warn(
      `  Failed to fetch V2 reserves for ${failedCalls}/${addresses.length} pool(s)` +
        (failedBatches > 0 ? ` across ${failedBatches} failed multicall batch(es).` : ".")
    );
  }

  states.noDataFailures = noDataFailures;
  return states;
}
