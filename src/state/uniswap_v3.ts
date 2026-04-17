// @ts-nocheck
/**
 * src/state/uniswap_v3.js — Uniswap V3 / Algebra pool state fetcher
 *
 * Fetches the full on-chain state needed for deterministic swap simulation:
 *   - slot0 / globalState (sqrtPriceX96, tick)
 *   - liquidity (global L)
 *   - tickBitmap (to discover initialized ticks)
 *   - tick data (liquidityNet for each initialized tick)
 *
 * Supports both:
 *   - Uniswap V3 forks (Uniswap V3, SushiSwap V3) — use slot0() + fee()
 *   - Algebra forks (QuickSwap V3) — use globalState() which bundles price,
 *     tick, and the current dynamic fee in a single call
 *
 * Uses viem multicall for batched RPC calls with retry/backoff.
 */

import {
  isNoDataReadContractError,
  readContractWithRetry,
  throttledMap,
} from "../enrichment/rpc.ts";
import { ENRICH_CONCURRENCY } from "../config/index.ts";

// ─── ABI fragments ───────────────────────────────────────────

const SLOT0_ABI = [
  {
    name: "slot0",
    type: "function",
    inputs: [],
    outputs: [
      { name: "sqrtPriceX96", type: "uint160" },
      { name: "tick", type: "int24" },
      { name: "observationIndex", type: "uint16" },
      { name: "observationCardinality", type: "uint16" },
      { name: "observationCardinalityNext", type: "uint16" },
      { name: "feeProtocol", type: "uint8" },
      { name: "unlocked", type: "bool" },
    ],
    stateMutability: "view",
  },
];

const LIQUIDITY_ABI = [
  {
    name: "liquidity",
    type: "function",
    inputs: [],
    outputs: [{ name: "", type: "uint128" }],
    stateMutability: "view",
  },
];

const TICK_SPACING_ABI = [
  {
    name: "tickSpacing",
    type: "function",
    inputs: [],
    outputs: [{ name: "", type: "int24" }],
    stateMutability: "view",
  },
];

const FEE_ABI = [
  {
    name: "fee",
    type: "function",
    inputs: [],
    outputs: [{ name: "", type: "uint24" }],
    stateMutability: "view",
  },
];

/**
 * Algebra Protocol (QuickSwap V3) globalState() ABI.
 *
 * Combines slot0 + fee into one call. Dynamic fee is stored in the pool
 * and may change per-block via the fee manager.
 *
 * Returns:
 *   [0] sqrtPriceX96   uint160 — current sqrt price (same semantics as Uniswap V3)
 *   [1] tick           int24   — current tick
 *   [2] fee            uint16  — current dynamic fee in hundredths of a bip
 *   [3] timepointIndex uint16  — index of the most recent timepoint
 *   [4] communityFeeToken0  uint8
 *   [5] communityFeeToken1  uint8
 *   [6] unlocked       bool
 */
const GLOBAL_STATE_ABI = [
  {
    name: "globalState",
    type: "function",
    inputs: [],
    outputs: [
      { name: "sqrtPriceX96", type: "uint160" },
      { name: "tick", type: "int24" },
      { name: "fee", type: "uint16" },
      { name: "timepointIndex", type: "uint16" },
      { name: "communityFeeToken0", type: "uint8" },
      { name: "communityFeeToken1", type: "uint8" },
      { name: "unlocked", type: "bool" },
    ],
    stateMutability: "view",
  },
];

const TICK_BITMAP_ABI = [
  {
    name: "tickBitmap",
    type: "function",
    inputs: [{ name: "wordPosition", type: "int16" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
];

const TICKS_ABI = [
  {
    name: "ticks",
    type: "function",
    inputs: [{ name: "tick", type: "int24" }],
    outputs: [
      { name: "liquidityGross", type: "uint128" },
      { name: "liquidityNet", type: "int128" },
      { name: "feeGrowthOutside0X128", type: "uint256" },
      { name: "feeGrowthOutside1X128", type: "uint256" },
      { name: "tickCumulativeOutside", type: "int56" },
      { name: "secondsPerLiquidityOutsideX128", type: "uint160" },
      { name: "secondsOutside", type: "uint32" },
      { name: "initialized", type: "bool" },
    ],
    stateMutability: "view",
  },
];

// ─── Constants ────────────────────────────────────────────────

const MIN_TICK = -887272;
const MAX_TICK = 887272;

// ─── Helpers ──────────────────────────────────────────────────

/**
 * Determine the range of word positions that cover all possible ticks.
 */
function wordRange(tickSpacing) {
  const minWord = Math.floor(Math.floor(MIN_TICK / tickSpacing) / 256);
  const maxWord = Math.floor(Math.floor(MAX_TICK / tickSpacing) / 256);
  return { minWord, maxWord };
}

/**
 * Extract initialized tick indices from a bitmap word.
 *
 * @param {bigint} word       The 256-bit bitmap word
 * @param {number} wordPos    The word position index
 * @param {number} tickSpacing The pool's tick spacing
 * @returns {number[]}        Array of initialized tick values
 */
function extractTicksFromWord(word, wordPos, tickSpacing) {
  const ticks = [];
  if (word === 0n) return ticks;

  for (let bit = 0; bit < 256; bit++) {
    if ((word >> BigInt(bit)) & 1n) {
      const compressed = wordPos * 256 + bit;
      ticks.push(compressed * tickSpacing);
    }
  }
  return ticks;
}

// ─── Core State Fetcher ───────────────────────────────────────

/**
 * Fetch the core state for a single V3 pool.
 *
 * For standard Uniswap V3 forks (Uniswap V3, SushiSwap V3):
 *   calls slot0() + liquidity() + fee() + tickSpacing() (4 RPC calls)
 *
 * For Algebra forks (QuickSwap V3):
 *   calls globalState() + liquidity() + tickSpacing() (3 RPC calls —
 *   globalState already bundles price, tick, and the current dynamic fee)
 *
 * @param {string}  poolAddress     Checksummed pool address
 * @param {Object}  [options]
 * @param {boolean} [options.isAlgebra=false]  Use Algebra globalState() instead of slot0()
 * @returns {{ sqrtPriceX96: bigint, tick: number, liquidity: bigint, fee: number, tickSpacing: number }}
 */
export async function fetchPoolCore(poolAddress, { isAlgebra = false } = {}) {
  if (isAlgebra) {
    // Algebra: globalState() returns (sqrtPriceX96, tick, fee, ...) in one call
    const [globalStateResult, liquidityResult, tickSpacingResult] =
      await Promise.all([
        readContractWithRetry({
          address: poolAddress,
          abi: GLOBAL_STATE_ABI,
          functionName: "globalState",
        }),
        readContractWithRetry({
          address: poolAddress,
          abi: LIQUIDITY_ABI,
          functionName: "liquidity",
        }),
        readContractWithRetry({
          address: poolAddress,
          abi: TICK_SPACING_ABI,
          functionName: "tickSpacing",
        }),
      ]);

    return {
      sqrtPriceX96: BigInt(globalStateResult[0]),
      tick:         Number(globalStateResult[1]),
      fee:          Number(globalStateResult[2]),   // dynamic fee (uint16)
      liquidity:    BigInt(liquidityResult),
      tickSpacing:  Number(tickSpacingResult),
    };
  }

  // Standard Uniswap V3: slot0() + fee() are separate calls
  const [slot0Result, liquidityResult, feeResult, tickSpacingResult] =
    await Promise.all([
      readContractWithRetry({
        address: poolAddress,
        abi: SLOT0_ABI,
        functionName: "slot0",
      }),
      readContractWithRetry({
        address: poolAddress,
        abi: LIQUIDITY_ABI,
        functionName: "liquidity",
      }),
      readContractWithRetry({
        address: poolAddress,
        abi: FEE_ABI,
        functionName: "fee",
      }),
      readContractWithRetry({
        address: poolAddress,
        abi: TICK_SPACING_ABI,
        functionName: "tickSpacing",
      }),
    ]);

  // slot0 returns an array: [sqrtPriceX96, tick, obsIdx, obsCard, obsCardNext, feeProt, unlocked]
  return {
    sqrtPriceX96: BigInt(slot0Result[0]),
    tick:         Number(slot0Result[1]),
    fee:          Number(feeResult),
    liquidity:    BigInt(liquidityResult),
    tickSpacing:  Number(tickSpacingResult),
  };
}

/**
 * Fetch the tick bitmap for a pool, returning all initialized tick indices.
 *
 * Strategy: Fetch all 256-bit words in the valid tick range, extract set bits.
 * Uses throttledMap to avoid RPC rate limits.
 *
 * @param {string} poolAddress  Pool address
 * @param {number} tickSpacing  Pool tick spacing
 * @returns {Promise<{ bitmaps: Map<number, bigint>, tickIndices: number[] }>}
 */
export async function fetchTickBitmap(poolAddress, tickSpacing) {
  const { minWord, maxWord } = wordRange(tickSpacing);
  const wordPositions = [];
  for (let w = minWord; w <= maxWord; w++) {
    wordPositions.push(w);
  }

  // Fetch all bitmap words with concurrency throttling
  const words = await throttledMap(
    wordPositions,
    async (wordPos) => {
      try {
        const result = await readContractWithRetry({
          address: poolAddress,
          abi: TICK_BITMAP_ABI,
          functionName: "tickBitmap",
          args: [wordPos],
        });
        return { wordPos, word: BigInt(result) };
      } catch {
        // Some word positions may revert if out of range
        return { wordPos, word: 0n };
      }
    },
    ENRICH_CONCURRENCY
  );

  const bitmaps = new Map();
  const tickIndices = [];

  for (const { wordPos, word } of words) {
    if (word !== 0n) {
      bitmaps.set(wordPos, word);
      tickIndices.push(...extractTicksFromWord(word, wordPos, tickSpacing));
    }
  }

  return { bitmaps, tickIndices: tickIndices.sort((a, b) => a - b) };
}

/**
 * Fetch liquidityNet for a batch of initialized ticks.
 *
 * @param {string} poolAddress     Pool address
 * @param {number[]} tickIndices   Array of initialized tick values
 * @returns {Map<number, { liquidityGross: bigint, liquidityNet: bigint }>}
 */
export async function fetchTickData(poolAddress, tickIndices) {
  const tickMap = new Map();

  if (tickIndices.length === 0) return tickMap;

  const results = await throttledMap(
    tickIndices,
    async (tick) => {
      try {
        const result = await readContractWithRetry({
          address: poolAddress,
          abi: TICKS_ABI,
          functionName: "ticks",
          args: [tick],
        });
        return {
          tick,
          liquidityGross: BigInt(result[0]),
          liquidityNet: BigInt(result[1]),
          initialized: Boolean(result[7]),
        };
      } catch {
        return { tick, liquidityGross: 0n, liquidityNet: 0n, initialized: false };
      }
    },
    ENRICH_CONCURRENCY
  );

  for (const r of results) {
    if (r.initialized && r.liquidityGross > 0n) {
      tickMap.set(r.tick, {
        liquidityGross: r.liquidityGross,
        liquidityNet: r.liquidityNet,
      });
    }
  }

  return tickMap;
}

/**
 * Fetch complete V3 pool state for swap simulation.
 *
 * Returns an immutable state snapshot containing everything needed
 * for deterministic off-chain swap simulation.
 *
 * @param {string}  poolAddress        Checksummed pool address
 * @param {Object}  [options]
 * @param {boolean} [options.isAlgebra=false]  Use Algebra globalState() interface
 * @returns {Promise<Object>}
 */
export async function fetchV3PoolState(poolAddress, { isAlgebra = false } = {}) {
  // Step 1: Core state (dispatches to Algebra or Uniswap V3 interface)
  const core = await fetchPoolCore(poolAddress, { isAlgebra });

  // Skip pools that are uninitialized (sqrtPriceX96 == 0)
  if (core.sqrtPriceX96 === 0n) {
    return {
      address: poolAddress,
      ...core,
      bitmaps: new Map(),
      ticks: new Map(),
      fetchedAt: Date.now(),
      initialized: false,
    };
  }

  // Step 2: Tick bitmap → initialized tick indices
  const { bitmaps, tickIndices } = await fetchTickBitmap(poolAddress, core.tickSpacing);

  // Step 3: Fetch liquidityNet for each initialized tick.
  // Algebra ticks() returns the same types as Uniswap V3 (uint128, int128, ..., bool)
  // so TICKS_ABI is compatible with both.
  const ticks = await fetchTickData(poolAddress, tickIndices);

  return {
    address: poolAddress,
    ...core,
    bitmaps,
    ticks,
    fetchedAt: Date.now(),
    initialized: true,
  };
}

/**
 * Fetch state for multiple V3 pools in parallel with concurrency control.
 *
 * @param {string[]} poolAddresses   Array of pool addresses
 * @param {number}   [concurrency=2] Max parallel pool fetches
 * @param {Map<string, { isAlgebra?: boolean }>} [poolMeta]
 *   Per-pool options keyed by lowercase address. Pass `{ isAlgebra: true }`
 *   for Algebra-based pools (QuickSwap V3) so the right state interface is used.
 * @returns {Promise<Map<string, Object>>}
 */
export async function fetchMultipleV3States(
  poolAddresses,
  concurrency = 2,
  poolMeta = new Map()
) {
  const states = new Map();
  const noDataFailures = new Set();

  const results = await throttledMap(
    poolAddresses,
    async (addr) => {
      try {
        const meta = poolMeta.get(addr.toLowerCase()) || {};
        const state = await fetchV3PoolState(addr, { isAlgebra: meta.isAlgebra || false });
        return { addr, state, error: null };
      } catch (error) {
        if (isNoDataReadContractError(error)) {
          noDataFailures.add(addr.toLowerCase());
        }
        console.warn(`  Failed to fetch state for ${addr}: ${error.message}`);
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
