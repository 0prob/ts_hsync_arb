
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

  constructor() {
    this.baseFee = 30n * 10n ** 9n;
    this.priorityFee = 30n * 10n ** 9n;
    this.maxFee = 90n * 10n ** 9n;
    this.updatedAt = 0;
    this.tokenPrices = new Map();
    this._interval = null;
  }

  /**
   * Start background polling for fee data.
   */
  start(intervalMs = 2000) {
    if (this._interval) return;
    this.update();
    this._interval = setInterval(() => this.update(), intervalMs);
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
  }

  getTokenPrice(tokenAddress: any) {
    return this.tokenPrices.get(tokenAddress.toLowerCase()) || null;
  }

  /**
   * Get the latest cached fee data.
   */
  getFees() {
    return {
      baseFee: this.baseFee,
      priorityFee: this.priorityFee,
      maxFee: this.maxFee,
      updatedAt: this.updatedAt,
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
  return oracle.getFees();
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

// ─── Recommended gas params ────────────────────────────────────

/**
 * Compute recommended gas parameters for a transaction.
 * Uses cached fees from the oracle to minimize hot-path latency.
 */
export async function recommendGasParams(tx: any, fromAddress: any, options: any = {}) {
  const { gasMultiplier = 1.25, maxFeeOverride, priorityFeeOverride } = options;

  // Only perform eth_estimateGas on the hot path; fees are cached
  const gasEstimate = await estimateGas(tx, fromAddress);
  const fees = oracle.getFees();

  const maxFeePerGas = maxFeeOverride ?? fees.maxFee;
  const maxPriorityFeePerGas = priorityFeeOverride ?? fees.priorityFee;

  const gasLimit = BigInt(Math.ceil(Number(gasEstimate) * gasMultiplier));
  const estimatedCostWei = gasLimit * maxFeePerGas;

  return {
    maxFeePerGas,
    maxPriorityFeePerGas,
    gasLimit,
    estimatedCostWei,
  };
}

export async function quickGasCheck(estimatedGasUnits = 400_000) {
  const fees = oracle.getFees();
  const estimatedCostWei = fees.maxFee * BigInt(estimatedGasUnits);
  return { gasPrice: fees.maxFee, estimatedCostWei };
}
