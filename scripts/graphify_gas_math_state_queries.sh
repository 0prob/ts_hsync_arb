#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FOCUS_PATH="${1:-src}"
UPDATE_PATH="${GRAPHIFY_UPDATE_PATH:-.}"

cd "$ROOT_DIR"

run() {
  printf '\n==> %s\n' "$*"
  "$@"
}

run graphify update "$UPDATE_PATH"

# Gas accounting and fee selection.
run graphify query "Trace gas calculations end to end from simulateHop and simulateRoute through gasCostWei, computeProfit, gasEstimateCacheKeyForRoute, estimateGas, recommendGasParams, scalePriorityFeeByProfitMargin, buildArbTx, sendTx, and sendTxBundle. Highlight every unit boundary, cache boundary, fallback, override, and place where gas is estimated, scaled, converted, or compared."

run graphify query "Inspect whether totalGas from simulateRoute, estimatedCostWei from recommendGasParams, gasCostWei in computeProfit, and actual execution costs implied by sendTx use consistent semantics. Identify any double counting, stale estimate reuse, mismatched fee fields, or cases where route-level gas and transaction-level gas diverge."

run graphify query "Explain how GasOracle.update, fetchEIP1559Fees, fetchGasPrice, quickGasCheck, estimateGas, and recommendGasParams interact. Focus on stale-fee risk, Polygon-specific assumptions, eth_feeHistory fallback behavior, priority-fee clamping, and where baseFee, priorityFee, and maxFee can become inconsistent with transaction building."

run graphify query "Trace how profit margin influences fee bidding across computeProfit, scalePriorityFeeByProfitMargin, recommendGasParams, buildArbTx, and sendTx. Identify where an aggressive fee bump could erase profit, where profit is measured before or after gas, and where the code assumes the start token can be compared to MATIC."

# Math correctness and invariants.
run graphify query "Audit all math modules for precision, rounding, overflow, and invariant assumptions across mulDiv, mulDivRoundingUp, divRoundingUp, getSqrtRatioAtTick, getTickAtSqrtRatio, getNextSqrtPriceFromInput, getNextSqrtPriceFromOutput, getAmount0Delta, getAmount1Delta, computeSwapStep, simulateV2Swap, simulateV3Swap, simulateCurveSwap, and simulateBalancerSwap. Call out the highest-risk inferred edges to verify in source."

run graphify query "Compare fee representations and scaling rules across normalizeV2State, normalizeV3State, normalizeCurveState, normalizeBalancerState, simulateHop, simulateV2Swap, simulateV3Swap, simulateCurveSwap, and simulateBalancerSwap. Identify places where the same field name fee means different units or denominators and could distort quotes or gas-adjusted profitability."

run graphify query "Trace token denomination and conversion logic across PriceOracle, computeProfit, gasCostWei, assessRouteResult, and any tokenToMaticRate flows. Focus on raw token units versus wei, decimal normalization assumptions, division truncation, and what happens when the start token is not WMATIC or has fewer than 18 decimals."

run graphify query "Which math paths can silently return 0, clamp values, cap risk, or truncate precision instead of failing loudly across simulateHop, simulateRoute, applySlippage, revertRiskPenalty, normalizePoolState, validatePoolState, getCurveAmountOut, getBalancerAmountOut, quoteV2, and quoteV3? Distinguish intended safety behavior from hidden false negatives."

# State shape, transitions, and freshness.
run graphify query "Trace state from chain ingestion to routing use: fetchV2PoolState, fetchMultipleV2States, fetchPoolCore, fetchTickBitmap, fetchTickData, fetchV3PoolState, fetchMultipleV3States, fetchAndNormalizeBalancerPool, fetchAndNormalizeCurvePool, normalizePoolState, validatePoolState, mergeWatcherState, commitWatcherState, persistWatcherState, reloadWatcherCache, and simulateHop. Highlight schema changes, lossy normalization, and places where state can become stale, partial, or protocol-incompatible."

run graphify query "Explain the state transition model inside StateWatcher, watcher_state_ops, and reorg handling. Focus on start, _buildQuery, _loop, detectReorg, handleWatcherLogs, updateV2State, updateV3SwapState, updateV3LiquidityState, updateTickState, mergeWatcherState, commitWatcherState, and reloadWatcherCache. Identify rollback hazards, ordering assumptions, and where in-memory cache and persisted registry state can diverge."

run graphify query "Inspect all freshness and invalidation logic that affects route correctness across StateWatcher, stateCache seeding and warmup, getPathFreshness, partitionFreshCandidates, RouteCache, clearGasEstimateCache, refresh cycle orchestration in runner.ts, and graph edge stateRef usage. Identify places where a route can be evaluated against mixed-time state or reused topology."

run graphify query "Trace all flows involving fromAddress, sender identity, and nonce-sensitive state across buildArbTx, estimateGas, recommendGasParams, sendTx, sendTxBundle, NonceManager, dryRun, rawTxHash, and receipt polling. Identify where account-specific gas estimation, approval state, balance state, or nonce state can make a simulation valid but execution fail."

run graphify query "Find graph bridges and refactor seams between runner.ts, execution, profit, state, routing, and math. Prioritize couplings that make gas calculations hard to trust, hide state transitions, or mix pure math with live-state and account-dependent behavior."

# Directed path queries for the critical handoffs.
run graphify path "simulateRoute()" "computeProfit()"
run graphify path "computeProfit()" "recommendGasParams()"
run graphify path "recommendGasParams()" "buildArbTx()"
run graphify path "buildArbTx()" "sendTx()"
run graphify path "fetchEIP1559Fees()" "sendTx()"
run graphify path "estimateGas()" "recommendGasParams()"
run graphify path "fetchMultipleV3States()" "normalizePoolState()"
run graphify path "normalizePoolState()" "simulateHop()"
run graphify path "StateWatcher" "simulateHop()"
run graphify path "updateV3LiquidityState()" "simulateV3Swap()"
run graphify path "updateTickState()" "computeSwapStep()"
run graphify path "PriceOracle" "computeProfit()"
run graphify path "gasEstimateCacheKeyForRoute()" "recommendGasParams()"
run graphify path "NonceManager" "sendTx()"

# Explanations for likely chokepoints.
run graphify explain "GasOracle"
run graphify explain "recommendGasParams()"
run graphify explain "computeProfit()"
run graphify explain "simulateRoute()"
run graphify explain "simulateHop()"
run graphify explain "normalizePoolState()"
run graphify explain "validatePoolState()"
run graphify explain "StateWatcher"
run graphify explain "updateV3SwapState()"
run graphify explain "updateV3LiquidityState()"
run graphify explain "updateTickState()"
run graphify explain "PriceOracle"
run graphify explain "buildArbTx()"
run graphify explain "sendTx()"
