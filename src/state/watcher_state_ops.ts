
/**
 * src/state/watcher_state_ops.js — State mutation helpers for StateWatcher
 */

import { mergeStateIntoCache, reloadCacheFromRegistry } from "./cache_utils.ts";
import { createWatcherProtocolHandlers } from "./watcher_protocol_handlers.ts";

export function toTopicArray(log: any) {
  return [log.topic0, log.topic1, log.topic2, log.topic3].filter((v) => v != null);
}

export async function handleWatcherLogs({
  logs,
  decoded,
  registry,
  cache,
  closed,
  topics,
  refreshBalancer,
  refreshCurve,
  enqueueEnrichment,
  commitState,
}: any) {
  const changedAddrs = new Set();
  const protocolHandlers = createWatcherProtocolHandlers({
    topics,
    updateV2State,
    updateV3SwapState,
    updateV3LiquidityState,
  });

  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];
    const dec = decoded[i];
    if (!dec) continue;
    if (closed()) break;

    const addr = log.address.toLowerCase();
    const pool = registry.getPoolMeta(addr);
    if (!pool) continue;

    const state = cache.get(addr);
    if (!state) continue;

    const topic0 = toTopicArray(log)[0];
    const handler = protocolHandlers.get(topic0);
    if (!handler) continue;

    try {
      if ((handler as any)({
        addr,
        log,
        pool,
        state,
        decoded: dec,
        commitState,
        enqueueEnrichment,
        refreshBalancer,
        refreshCurve,
      })) {
        changedAddrs.add(addr);
      }
    } catch (err: any) {
      console.warn(`[watcher] Failed to update ${addr}: ${err.message}`);
    }
  }

  return changedAddrs;
}

export function updateV2State(state: any, decoded: any) {
  state.reserve0 = BigInt(decoded.body[0].val);
  state.reserve1 = BigInt(decoded.body[1].val);
}

export function updateV3SwapState(state: any, decoded: any) {
  state.sqrtPriceX96 = BigInt(decoded.body[2].val);
  state.liquidity = BigInt(decoded.body[3].val);
  state.tick = Number(decoded.body[4].val);
  state.initialized = true;
}

export function updateV3LiquidityState(state: any, decoded: any, isMint: any) {
  const tickLower = Number(decoded.indexed[1].val);
  const tickUpper = Number(decoded.indexed[2].val);
  const amount = BigInt(decoded.body[1].val);

  if (state.tick >= tickLower && state.tick < tickUpper) {
    if (isMint) state.liquidity = (state.liquidity ?? 0n) + amount;
    else state.liquidity = (state.liquidity ?? 0n) - amount;
  }

  updateTickState(state, tickLower, amount, isMint);
  updateTickState(state, tickUpper, amount, !isMint);
}

export function updateTickState(state: any, tick: any, amount: any, isNetPositive: any) {
  if (!state.ticks) state.ticks = new Map();
  const data = state.ticks.get(tick) || { liquidityGross: 0n, liquidityNet: 0n };

  data.liquidityGross += amount;
  if (isNetPositive) data.liquidityNet += amount;
  else data.liquidityNet -= amount;

  if (data.liquidityGross === 0n) state.ticks.delete(tick);
  else state.ticks.set(tick, data);
}

export function mergeWatcherState(cache: any, addr: any, nextState: any) {
  return mergeStateIntoCache(cache, addr, nextState);
}

export function commitWatcherState(cache: any, persistState: any, addr: any, state: any, rawLog: any) {
  state.timestamp = Date.now();
  cache.set(addr, state);
  persistState(addr, state, rawLog);
}

export function persistWatcherState(registry: any, addr: any, state: any, rawLog: any, fallbackBlock: any) {
  try {
    registry.updatePoolState({
      pool_address: addr,
      block: Number(rawLog?.blockNumber ?? fallbackBlock),
      data: state,
    });
  } catch (err: any) {
    console.warn(`[watcher] Failed to persist state for ${addr}: ${err.message}`);
  }
}

export function reloadWatcherCache(registry: any, cache: any, pendingEnrichment: any) {
  return reloadCacheFromRegistry(registry, cache, pendingEnrichment);
}
