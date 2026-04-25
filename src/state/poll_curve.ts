
/**
 * src/state/poll_curve.js — Curve pool balances + virtual price poller
 *
 * Fetches on-chain state for Curve pools:
 *   - balances[] via get_balances() or balances(i)
 *   - virtual_price() for LP token pricing
 *   - A() amplification coefficient
 *   - fee() swap fee
 *
 * Normalizes into the canonical state format and writes to a shared cache.
 *
 * Usage:
 *   import { PollCurve } from "./poll_curve.js";
 *   const poller = new PollCurve(registry, stateCache);
 *   await poller.poll();
 *   poller.start(30_000);
 */

import { readContractWithRetry, throttledMap } from "../enrichment/rpc.ts";
import { normalizeCurveState } from "./normalizer.ts";
import { ENRICH_CONCURRENCY } from "../config/index.ts";
import { parsePoolTokens } from "./pool_record.ts";
import { metadataWithTokenDecimals } from "./pool_metadata.ts";
import { asBatchResult, TimedPoller } from "./poller_base.ts";
import { CURVE_PROTOCOLS, normalizeProtocolKey } from "../protocols/classification.ts";

// ─── ABI fragments ────────────────────────────────────────────

const GET_BALANCES_ABI = [
  {
    name: "get_balances",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256[8]" }],
  },
];

// Individual balance query (for pools without get_balances)
const BALANCE_ABI = (idx: number) => [
  {
    name: "balances",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "i", type: idx < 0x80 ? "uint256" : "int128" }],
    outputs: [{ name: "", type: "uint256" }],
  },
];

const VIRTUAL_PRICE_ABI = [
  {
    name: "get_virtual_price",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
];

const A_ABI = [
  {
    name: "A",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
];

const FEE_ABI = [
  {
    name: "fee",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
];

// ─── Fetch helpers ────────────────────────────────────────────

/**
 * Fetch Curve pool state for a single pool.
 *
 * @param {string}   poolAddress  Pool contract address
 * @param {number}   nCoins       Number of coins in the pool
 * @returns {Promise<Object>}     Raw Curve state
 */
export async function fetchCurvePoolState(poolAddress: string, nCoins: number) {
  const PRECISION = 10n ** 18n;

  // Try get_balances() first; fall back to per-index balances()
  let balances: bigint[] = [];
  try {
    const raw = await readContractWithRetry({
      address: poolAddress,
      abi: GET_BALANCES_ABI,
      functionName: "get_balances",
    });
    balances = Array.from(raw as ArrayLike<string | number | bigint | boolean>)
      .slice(0, nCoins)
      .map((value) => BigInt(value));
  } catch {
    // Fall back: query balances(i) for each coin
    for (let i = 0; i < nCoins; i++) {
      try {
        const b = await readContractWithRetry({
          address: poolAddress,
          abi: BALANCE_ABI(i),
          functionName: "balances",
          args: [i],
        });
        balances.push(BigInt(b));
      } catch {
        balances.push(0n);
      }
    }
  }

  // Fetch A, fee, virtual_price in parallel
  const [AResult, feeResult, virtualPriceResult] = await Promise.allSettled([
    readContractWithRetry({ address: poolAddress, abi: A_ABI, functionName: "A" }),
    readContractWithRetry({ address: poolAddress, abi: FEE_ABI, functionName: "fee" }),
    readContractWithRetry({ address: poolAddress, abi: VIRTUAL_PRICE_ABI, functionName: "get_virtual_price" }),
  ]);

  const A = AResult.status === "fulfilled" ? BigInt(AResult.value) : 100n;
  const fee = feeResult.status === "fulfilled" ? BigInt(feeResult.value) : 4_000_000n;
  const virtualPrice = virtualPriceResult.status === "fulfilled"
    ? BigInt(virtualPriceResult.value)
    : PRECISION;

  return {
    balances,
    rates: Array(nCoins).fill(PRECISION), // default rates; may be overridden per pool type
    A: A * 100n, // Convert to A_PRECISION (x100)
    fee,          // in 1e10
    virtualPrice,
    fetchedAt: Date.now(),
  };
}

export { metadataWithTokenDecimals };

export async function fetchAndNormalizeCurvePool(pool: any, options: { tokenDecimals?: Map<string, number> | null } = {}) {
  const addr = pool.pool_address.toLowerCase();
  const tokens = parsePoolTokens(pool.tokens);
  const nCoins = tokens.length || 2;

  const rawState = await fetchCurvePoolState(addr, nCoins);
  const metadata = metadataWithTokenDecimals(pool, tokens, options.tokenDecimals);
  const normalized = normalizeCurveState(
    addr,
    pool.protocol,
    tokens,
    rawState,
    metadata
  );

  return { addr, normalized };
}

// ─── Poller class ─────────────────────────────────────────────

export class PollCurve extends TimedPoller {
  private _registry: any;
  private _cache: Map<string, any>;
  private _concurrency: number;

  constructor(registry: any, stateCache: Map<string, any>, options: any = {}) {
    super(options);
    this._registry = registry;
    this._cache = stateCache;
    this._concurrency = options.concurrency ?? ENRICH_CONCURRENCY;
  }

  async poll() {
    const t0 = Date.now();

    const pools = this._registry.getActivePoolsMeta().filter(
      (p: any) => CURVE_PROTOCOLS.has(normalizeProtocolKey(p.protocol))
    );

    if (pools.length === 0) {
      return { updated: 0, failed: 0, durationMs: Date.now() - t0 };
    }

    const results = await throttledMap(
      pools,
      async (pool: any) => {
        try {
          const tokens = parsePoolTokens(pool.tokens);
          const tokenDecimals = this._registry.getTokenDecimals(tokens);
          const { addr, normalized } = await fetchAndNormalizeCurvePool(pool, { tokenDecimals });
          return asBatchResult(addr, normalized);
        } catch (err: any) {
          const addr = pool.pool_address.toLowerCase();
          return asBatchResult(addr, null, err);
        }
      },
      this._concurrency
    );

    const { updated, failed } = this._storeBatchResults(
      "poll_curve",
      this._cache,
      results,
      ({ addr, normalized }) => `[poll_curve] ${addr} A=${normalized.A} balances=${normalized.balances}`
    );

    return this._completePass("poll_curve", t0, updated, failed);
  }

  start(intervalMs = 30_000) {
    this._startLoop("poll_curve", intervalMs, () => this.poll());
  }
}
