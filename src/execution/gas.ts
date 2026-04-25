
/**
 * src/execution/gas.js — Gas estimation and fee management
 *
 * Optimized for HFT:
 *   - Uses the shared RPC manager for multi-endpoint switching.
 *   - Automatically fails over to an alternate endpoint on rate-limits / errors.
 *   - Implements a background Gas Oracle to provide zero-latency fee data.
 */

import { createPublicClient, http } from "viem";
import { polygon } from "viem/chains";
import { dynamicPublicClient } from "../utils/rpc_manager.ts";
import { executeWithRpcRetry } from "../enrichment/rpc.ts";
import { POLYGON_RPC } from "../config/index.ts";

// ─── Optimized Client ───────────────────────────────────────────
// The dynamic proxy always delegates to the best available RPC endpoint.

export const client = dynamicPublicClient;

export const executionClient = createPublicClient({
  chain: polygon,
  transport: http(POLYGON_RPC, {
    timeout: 10_000,
    fetchOptions: { headers: { Connection: "keep-alive" } },
  }),
});

const gasEstimateCache = new Map<string, bigint>();
const GAS_ORACLE_MAX_AGE_MS = 15_000;
const GAS_MULTIPLIER_SCALE = 10_000n;

type FeeSnapshot = {
  baseFee: bigint;
  priorityFee: bigint;
  maxFee: bigint;
  updatedAt?: number;
};

function maxBigInt(a: bigint, b: bigint) {
  return a > b ? a : b;
}

export function effectiveGasPriceWei(fees: FeeSnapshot) {
  const effective = fees.baseFee + fees.priorityFee;
  return effective > fees.maxFee ? fees.maxFee : effective;
}

function bufferedGasLimit(gasEstimate: bigint, gasMultiplier: number) {
  if (!Number.isFinite(gasMultiplier) || gasMultiplier <= 0) {
    throw new Error("gasMultiplier must be a finite positive number");
  }
  if (gasEstimate < 0n) {
    throw new Error("gasEstimate must be non-negative");
  }
  const multiplierBpsNumber = Math.ceil(gasMultiplier * Number(GAS_MULTIPLIER_SCALE));
  if (!Number.isSafeInteger(multiplierBpsNumber)) {
    throw new Error("gasMultiplier is too large");
  }
  const multiplierBps = BigInt(multiplierBpsNumber);
  return (gasEstimate * multiplierBps + GAS_MULTIPLIER_SCALE - 1n) / GAS_MULTIPLIER_SCALE;
}

// ─── Gas Oracle ───────────────────────────────────────────────

/**
 * Background Gas Oracle to keep latest fee data ready for the hot path.
 */
class GasOracle {
  baseFee: bigint;
  priorityFee: bigint;
  maxFee: bigint;
  updatedAt: number;
  tokenPrices: Map<string, bigint>;
  private _interval: ReturnType<typeof setInterval> | null;
  private _updatePromise: Promise<void> | null;

  constructor() {
    this.baseFee = 30n * 10n ** 9n;
    this.priorityFee = 30n * 10n ** 9n;
    this.maxFee = 90n * 10n ** 9n;
    this.updatedAt = 0;
    this.tokenPrices = new Map();
    this._interval = null;
    this._updatePromise = null;
  }

  /**
   * Start background polling for fee data.
   */
  start(intervalMs = 2000) {
    if (this._interval) return;
    void this.update();
    this._interval = setInterval(() => this.update(), intervalMs);
    this._interval.unref?.();
  }

  /**
   * Update the latest fee data from the network.
   *
   * Strategy:
   *   1. Fetch the latest block to get baseFeePerGas.
   *   2. Call eth_feeHistory (10 blocks, p25/p50/p75 reward percentiles) to
   *      derive a data-driven priority fee.  Falls back to the previous value
   *      if the endpoint does not support eth_feeHistory.
   *
   * Polygon specifics:
   *   - Blocks arrive every ~2 s; polling every 1–2 s is sufficient.
   *   - Base fee on Polygon is typically 30–200 gwei.
   *   - Priority fee is almost always 30 gwei (Polygon doesn't use EIP-1559
   *     priority fee the same way Ethereum does, but validators still accept it).
   */
  async update() {
    if (this._updatePromise) {
      return this._updatePromise;
    }

    this._updatePromise = (async () => {
      try {
        const block = await executeWithRpcRetry((c: any) =>
          c.getBlock({ blockTag: "latest" })
        );
        this.baseFee = block.baseFeePerGas ?? 30n * 10n ** 9n;

        // ── Priority fee via eth_feeHistory ──────────────────────
        try {
          const feeHistory = await executeWithRpcRetry((c: any) =>
            c.getFeeHistory({
              blockCount: 10,
              rewardPercentiles: [25, 50, 75],
              blockTag: "latest",
            })
          );

          // Extract p50 (index 1) priority fee rewards from the last 10 blocks
          const rewards = feeHistory?.reward ?? [];
          const p50s = rewards
            .map((r: any) => (r && r[1] != null ? BigInt(r[1]) : null))
            .filter((r: any) => r !== null && r > 0n);

          if (p50s.length > 0) {
            const sorted = [...p50s].sort((a, b) => (a > b ? 1 : a < b ? -1 : 0));
            const medianPriority = sorted[Math.floor(sorted.length / 2)];
            // Clamp: never below 1 gwei, never above 500 gwei (avoids outliers)
            const floor = 1n * 10n ** 9n;
            const ceil  = 500n * 10n ** 9n;
            this.priorityFee = medianPriority < floor ? floor
                             : medianPriority > ceil  ? ceil
                             : medianPriority;
          }
          // If no valid rewards returned, keep the previous priorityFee
        } catch {
          // eth_feeHistory not supported on this endpoint (e.g. some public RPCs).
          // Retain existing priorityFee (already conservative at 30 gwei default).
        }

        this.maxFee = this.baseFee * 2n + this.priorityFee;
        this.updatedAt = Date.now();
      } catch (err: any) {
        console.warn(`[gas_oracle] Update failed: ${err.message}`);
      }
    })();

    try {
      await this._updatePromise;
    } finally {
      this._updatePromise = null;
    }
  }

  getTokenPrice(tokenAddress: any) {
    return this.tokenPrices.get(tokenAddress.toLowerCase()) || null;
  }

  /**
   * Get the latest cached fee data.
   */
  getFees() {
    const snapshot = {
      baseFee: this.baseFee,
      priorityFee: this.priorityFee,
      maxFee: this.maxFee,
      updatedAt: this.updatedAt,
    };
    return {
      ...snapshot,
      effectiveGasPriceWei: effectiveGasPriceWei(snapshot),
    };
  }

  stop() {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
  }
}

export const oracle = new GasOracle();
// Start oracle automatically in production-like environments
if (process.env.NODE_ENV !== 'test') {
  oracle.start();
}

// ─── Gas price ────────────────────────────────────────────────

export async function fetchGasPrice() {
  return executeWithRpcRetry((c: any) => c.getGasPrice());
}

/**
 * Fetch EIP-1559 fee data: baseFeePerGas + maxPriorityFeePerGas.
 * Uses the background oracle for zero-latency access.
 */
export async function fetchEIP1559Fees() {
  return ensureFreshGasOracle();
}

// ─── Gas estimation ───────────────────────────────────────────

export async function estimateGas(tx: any, fromAddress: any) {
  return executeWithRpcRetry((c: any) =>
    c.estimateGas({
      account: fromAddress,
      to: tx.to,
      data: tx.data,
      value: tx.value ?? 0n,
    })
  );
}

export function clearGasEstimateCache() {
  gasEstimateCache.clear();
}

export function isGasOracleStale(updatedAt: number, options: any = {}) {
  const now = Number(options.now ?? Date.now());
  const maxAgeMs = Number(options.maxAgeMs ?? GAS_ORACLE_MAX_AGE_MS);
  if (!Number.isFinite(updatedAt) || updatedAt <= 0) return true;
  if (!Number.isFinite(now) || !Number.isFinite(maxAgeMs) || maxAgeMs < 0) return true;
  return now - updatedAt > maxAgeMs;
}

export async function ensureFreshGasOracle(options: any = {}) {
  const {
    maxAgeMs = GAS_ORACLE_MAX_AGE_MS,
    allowStaleOnFailure = true,
  } = options;

  const before = oracle.getFees();
  if (!isGasOracleStale(before.updatedAt, { maxAgeMs })) {
    return before;
  }

  await oracle.update();

  const after = oracle.getFees();
  if (!isGasOracleStale(after.updatedAt, { maxAgeMs })) {
    return after;
  }

  if (allowStaleOnFailure && after.updatedAt > 0) {
    return after;
  }

  throw new Error("Gas oracle has no fresh fee snapshot available.");
}

export function gasEstimateCacheKey(tx: any, fromAddress: any) {
  const to = String(tx?.to ?? "").toLowerCase();
  const data = String(tx?.data ?? "").toLowerCase();
  const value = String(tx?.value ?? 0n);
  const account = String(fromAddress ?? "").toLowerCase();
  return `${account}|${to}|${value}|${data}`;
}

function clampBigInt(value: bigint, min: bigint, max: bigint) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * Scale the priority fee bid up with expected profit margin.
 *
 * Margin is expressed in basis points of the input amount. The bid ramps from
 * 1.0x at 0 bps to 3.0x once the margin reaches 500 bps (5%).
 */
export function scalePriorityFeeByProfitMargin(
  fees: { baseFee: bigint; priorityFee: bigint; maxFee: bigint },
  profitMarginBps: bigint | number,
  options: any = {},
) {
  const minMultiplierBps = BigInt(options.minMultiplierBps ?? 10_000n);
  const maxMultiplierBps = BigInt(options.maxMultiplierBps ?? 30_000n);
  const fullRampMarginBps = BigInt(options.fullRampMarginBps ?? 500n);

  const margin = clampBigInt(BigInt(profitMarginBps ?? 0), 0n, fullRampMarginBps);
  const multiplierBps =
    minMultiplierBps +
    ((maxMultiplierBps - minMultiplierBps) * margin) / fullRampMarginBps;
  const maxPriorityFeePerGas =
    (fees.priorityFee * multiplierBps + 9_999n) / 10_000n;
  const maxFeePerGas = fees.baseFee * 2n + maxPriorityFeePerGas;

  return {
    multiplierBps,
    maxPriorityFeePerGas,
    maxFeePerGas,
  };
}

// ─── Recommended gas params ────────────────────────────────────

/**
 * Compute recommended gas parameters for a transaction.
 * Uses cached fees from the oracle to minimize hot-path latency.
 */
export async function recommendGasParams(tx: any, fromAddress: any, options: any = {}) {
  const {
    gasMultiplier = 1.25,
    maxFeeOverride,
    priorityFeeOverride,
    gasEstimateCacheKey,
    forceRefreshEstimate = false,
    requireFreshFees = true,
    gasOracleMaxAgeMs = GAS_ORACLE_MAX_AGE_MS,
    allowStaleFeesOnRefreshFailure = true,
  } = options;

  // Only perform eth_estimateGas on the hot path when the route shape is not
  // already cached for the current topology version.
  let gasEstimate: bigint | undefined = undefined;
  if (gasEstimateCacheKey && !forceRefreshEstimate) {
    gasEstimate = gasEstimateCache.get(gasEstimateCacheKey);
  }
  if (gasEstimate == null) {
    gasEstimate = await estimateGas(tx, fromAddress);
    if (gasEstimateCacheKey) {
      gasEstimateCache.set(gasEstimateCacheKey, gasEstimate as bigint);
    }
  }
  if (gasEstimate == null) {
    throw new Error("gas estimate unavailable");
  }
  const fees = requireFreshFees
    ? await ensureFreshGasOracle({
        maxAgeMs: gasOracleMaxAgeMs,
        allowStaleOnFailure: allowStaleFeesOnRefreshFailure,
      })
    : oracle.getFees();

  const baseFee = fees.baseFee;
  let maxPriorityFeePerGas = priorityFeeOverride ?? fees.priorityFee;
  let maxFeePerGas = maxFeeOverride ?? fees.maxFee;

  if (maxFeeOverride != null && maxFeePerGas < baseFee) {
    throw new Error("maxFeePerGas is below current baseFee");
  }
  if (priorityFeeOverride != null && maxFeeOverride == null) {
    maxFeePerGas = maxBigInt(maxFeePerGas, baseFee * 2n + maxPriorityFeePerGas);
  }
  if (maxPriorityFeePerGas > maxFeePerGas) {
    if (priorityFeeOverride != null && maxFeeOverride != null) {
      throw new Error("maxPriorityFeePerGas cannot exceed maxFeePerGas");
    }
    maxPriorityFeePerGas = maxFeePerGas;
  }

  const gasLimit = bufferedGasLimit(gasEstimate, gasMultiplier);
  const effectiveGasPrice = effectiveGasPriceWei({
    baseFee,
    priorityFee: maxPriorityFeePerGas,
    maxFee: maxFeePerGas,
  });
  const estimatedCostWei = gasLimit * effectiveGasPrice;
  const maxCostWei = gasLimit * maxFeePerGas;

  return {
    maxFeePerGas,
    maxPriorityFeePerGas,
    gasLimit,
    effectiveGasPriceWei: effectiveGasPrice,
    estimatedCostWei,
    maxCostWei,
  };
}

export async function quickGasCheck(estimatedGasUnits = 400_000) {
  const fees = await ensureFreshGasOracle();
  const gasPrice = effectiveGasPriceWei(fees);
  const estimatedCostWei = gasPrice * BigInt(estimatedGasUnits);
  return { gasPrice, estimatedCostWei, maxCostWei: fees.maxFee * BigInt(estimatedGasUnits) };
}
