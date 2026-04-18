
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

// ─── Protocols covered ────────────────────────────────────────

const CURVE_PROTOCOLS = new Set([
  "CURVE_STABLE",
  "CURVE_CRYPTO",
  "CURVE_MAIN",
  "CURVE_FACTORY_STABLE",
  "CURVE_FACTORY_CRYPTO",
  "CURVE_CRYPTO_FACTORY",
  "CURVE_STABLE_FACTORY",
]);

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
const BALANCE_ABI = (idx) => [
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

const N_COINS_ABI = [
  {
    name: "N_COINS",
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
export async function fetchCurvePoolState(poolAddress, nCoins) {
  const PRECISION = 10n ** 18n;

  // Try get_balances() first; fall back to per-index balances()
  let balances = [];
  try {
    const raw = await readContractWithRetry({
      address: poolAddress,
      abi: GET_BALANCES_ABI,
      functionName: "get_balances",
    });
    balances = Array.from(raw)
      .slice(0, nCoins)
      .map(BigInt);
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

export async function fetchAndNormalizeCurvePool(pool) {
  const addr = pool.pool_address.toLowerCase();
  const tokens = parsePoolTokens(pool.tokens);
  const nCoins = tokens.length || 2;

  const rawState = await fetchCurvePoolState(addr, nCoins);
  const normalized = normalizeCurveState(
    addr,
    pool.protocol,
    tokens,
    rawState,
    pool.metadata
  );

  return { addr, normalized };
}

// ─── Poller class ─────────────────────────────────────────────

export class PollCurve {
  /**
   * @param {import('../db/registry.ts').RegistryService} registry
   * @param {Map<string, Object>} stateCache
   * @param {Object} [options]
   * @param {number} [options.concurrency=3]
   * @param {boolean} [options.verbose=false]
   */
  constructor(registry, stateCache, options = {}) {
    this._registry = registry;
    this._cache = stateCache;
    this._concurrency = options.concurrency ?? ENRICH_CONCURRENCY;
    this._verbose = options.verbose ?? false;
    this._timer = null;
    this._running = false;
    this._passCount = 0;
  }

  async poll() {
    const t0 = Date.now();

    const pools = this._registry.getActivePoolsMeta().filter(
      (p) => CURVE_PROTOCOLS.has(p.protocol)
    );

    if (pools.length === 0) {
      return { updated: 0, failed: 0, durationMs: Date.now() - t0 };
    }

    const results = await throttledMap(
      pools,
      async (pool) => {
        try {
          const { addr, normalized } = await fetchAndNormalizeCurvePool(pool);
          return { addr, normalized, error: null };
        } catch (err) {
          const addr = pool.pool_address.toLowerCase();
          return { addr, normalized: null, error: err };
        }
      },
      this._concurrency
    );

    let updated = 0;
    let failed = 0;

    for (const { addr, normalized, error } of results) {
      if (normalized) {
        this._cache.set(addr, normalized);
        updated++;
        if (this._verbose) {
          console.log(`[poll_curve] ${addr} A=${normalized.A} balances=${normalized.balances}`);
        }
      } else {
        failed++;
        if (this._verbose) {
          console.warn(`[poll_curve] Failed ${addr}: ${error?.message}`);
        }
      }
    }

    const durationMs = Date.now() - t0;
    this._passCount++;
    console.log(
      `[poll_curve] Pass #${this._passCount}: ${updated} updated, ${failed} failed (${durationMs}ms)`
    );

    return { updated, failed, durationMs };
  }

  start(intervalMs = 30_000) {
    if (this._running) return;
    this._running = true;

    const loop = async () => {
      if (!this._running) return;
      try {
        await this.poll();
      } catch (err) {
        console.error(`[poll_curve] Poll error: ${err.message}`);
      }
      if (this._running) {
        this._timer = setTimeout(loop, intervalMs);
      }
    };

    loop();
  }

  stop() {
    this._running = false;
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }

  get isRunning() {
    return this._running;
  }
}
