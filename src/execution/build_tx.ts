// @ts-nocheck
/**
 * src/execution/build_tx.js — Transaction builder
 *
 * Constructs the complete transaction object for an arbitrage execution.
 * Delegates calldata encoding to the existing calldata.js module and
 * adds gas parameters from gas.js.
 *
 * This module is a pure builder — it does not submit transactions.
 * Use send_tx.js for submission.
 *
 * Usage:
 *   import { buildArbTx } from "./build_tx.js";
 *   const tx = await buildArbTx(route, config);
 *   // tx: { to, data, value, maxFeePerGas, maxPriorityFeePerGas, gasLimit, ... }
 */

import { encodeRoute, encodeExecuteArb, buildFlashParams } from "./calldata.ts";
import { BALANCER_VAULT } from "./addresses.ts";
import { recommendGasParams } from "./gas.ts";

// ─── Defaults ─────────────────────────────────────────────────

const DEFAULT_DEADLINE_OFFSET_S = 120;
const DEFAULT_SLIPPAGE_BPS = 50;
const DEFAULT_MIN_PROFIT = 0n;
const DEFAULT_GAS_MULTIPLIER = 1.25;

// ─── Helpers ──────────────────────────────────────────────────

/**
 * Determine the flash loan token and amount for a route.
 *
 * @param {Object} route  { path, result }
 * @returns {{ flashToken: string, flashAmount: bigint }}
 */
function resolveFlashLoan(route) {
  return {
    flashToken: route.path.startToken,
    flashAmount: route.result.amountIn,
  };
}

// ─── Main builder ─────────────────────────────────────────────

/**
 * @typedef {Object} BuiltTx
 * @property {string}  to                   Contract to call (ArbExecutor)
 * @property {string}  data                 Encoded calldata
 * @property {bigint}  value                ETH value (0 for ERC-20 arbs)
 * @property {bigint}  maxFeePerGas         EIP-1559 max fee
 * @property {bigint}  maxPriorityFeePerGas EIP-1559 priority fee
 * @property {bigint}  gasLimit             Gas limit with safety buffer
 * @property {Object}  meta                 Human-readable metadata
 * @property {Object}  flashParams          Encoded flash loan params
 */

/**
 * Build a complete arbitrage transaction (without submitting).
 *
 * @param {Object} route              Profitable route { path, result }
 * @param {Object} config
 * @param {string} config.executorAddress  Deployed ArbExecutor contract address
 * @param {string} config.fromAddress      Sender/signer address (for gas estimation)
 * @param {Object} [options]
 * @param {bigint} [options.minProfit]     Minimum profit enforced on-chain
 * @param {number} [options.deadlineOffsetS]
 * @param {number} [options.slippageBps]
 * @param {number} [options.gasMultiplier]
 * @param {bigint} [options.maxFeeOverride]
 * @param {bigint} [options.priorityFeeOverride]
 * @param {{maxFeePerGas: bigint, maxPriorityFeePerGas: bigint, gasLimit: bigint, estimatedCostWei: bigint}} [options.gasParamsOverride]
 * @returns {Promise<BuiltTx>}
 */
export async function buildArbTx(route, config, options = {}) {
  const { executorAddress, fromAddress } = config;
  const {
    minProfit = DEFAULT_MIN_PROFIT,
    deadlineOffsetS = DEFAULT_DEADLINE_OFFSET_S,
    slippageBps = DEFAULT_SLIPPAGE_BPS,
    gasMultiplier = DEFAULT_GAS_MULTIPLIER,
    maxFeeOverride,
    priorityFeeOverride,
    gasParamsOverride = null,
  } = options;

  if (!executorAddress) throw new Error("buildArbTx: executorAddress required");
  if (!fromAddress) throw new Error("buildArbTx: fromAddress required");

  const { flashToken, flashAmount } = resolveFlashLoan(route);
  const profitToken = route.path.startToken;
  const deadline = BigInt(Math.floor(Date.now() / 1000) + deadlineOffsetS);

  // Encode route into Call[]
  const calls = encodeRoute(route, executorAddress, { slippageBps });

  // Build flash loan params (includes route hash)
  const flashParams = buildFlashParams({ profitToken, minProfit, deadline, calls });

  // Encode full executeArb calldata
  const encodedTx = encodeExecuteArb({
    executorAddress,
    flashToken,
    flashAmount,
    profitToken,
    minProfit,
    deadline,
    calls,
  });

  // Build skeleton tx for gas estimation
  const skelTx = {
    to: encodedTx.to,
    data: encodedTx.data,
    value: 0n,
  };

  // Get gas params (estimate + EIP-1559 fees)
  const gasParams = gasParamsOverride ?? await recommendGasParams(skelTx, fromAddress, {
    gasMultiplier,
    maxFeeOverride,
    priorityFeeOverride,
  });

  // Metadata for logging
  const meta = {
    protocol: route.path.edges.map((e) => e.protocol),
    pools: route.result.poolPath,
    tokens: route.result.tokenPath,
    hopAmounts: route.result.hopAmounts.map(String),
    expectedProfit: route.result.profit.toString(),
    flashToken,
    flashAmount: flashAmount.toString(),
    callCount: calls.length,
    routeHash: flashParams.routeHash,
    deadline: Number(deadline),
    slippageBps,
    gasLimit: gasParams.gasLimit.toString(),
    estimatedGasCostWei: gasParams.estimatedCostWei.toString(),
  };

  return {
    to: encodedTx.to,
    data: encodedTx.data,
    value: 0n,
    maxFeePerGas: gasParams.maxFeePerGas,
    maxPriorityFeePerGas: gasParams.maxPriorityFeePerGas,
    gasLimit: gasParams.gasLimit,
    meta,
    flashParams,
    calls,
  };
}

/**
 * Build a simple ERC-20 transfer transaction (for testing/approval flows).
 *
 * @param {string} token      Token address
 * @param {string} to         Recipient
 * @param {bigint} amount     Amount in token units
 * @param {string} fromAddress Sender
 * @returns {Promise<BuiltTx>}
 */
export async function buildTransferTx(token, to, amount, fromAddress) {
  // ERC-20 transfer(address,uint256) = 0xa9059cbb
  const data =
    "0xa9059cbb" +
    to.replace("0x", "").padStart(64, "0") +
    amount.toString(16).padStart(64, "0");

  const skelTx = { to: token, data, value: 0n };
  const gasParams = await recommendGasParams(skelTx, fromAddress);

  return {
    to: token,
    data,
    value: 0n,
    ...gasParams,
    meta: { type: "erc20_transfer", token, to, amount: amount.toString() },
  };
}
