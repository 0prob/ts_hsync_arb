
/**
 * src/state/watcher_state_ops.js — State mutation helpers for StateWatcher
 */

import { mergeStateIntoCache, reloadCacheFromRegistry } from "./cache_utils.ts";
import { createWatcherProtocolHandlers } from "./watcher_protocol_handlers.ts";
import { validatePoolState } from "./normalizer.ts";
import { logger } from "../utils/logger.ts";

const watcherStateLogger: any = logger.child({ component: "watcher_state_ops" });

export function toTopicArray(log: any) {
  if (Array.isArray(log?.topics)) {
    const flattened = log.topics.flatMap((topic: any) =>
      Array.isArray(topic) ? topic : [topic],
    ).filter((topic: any) => topic != null);
    if (flattened.length > 0) {
      return flattened;
    }
  }
  return [log?.topic0, log?.topic1, log?.topic2, log?.topic3].filter((v) => v != null);
}

export async function handleWatcherLogs({
  logs,
  decoded,
  registry,
  cache,
  closed,
  topic0,
  refreshBalancer,
  refreshCurve,
  enqueueEnrichment,
  commitStates,
}: any) {
  const changedAddrs = new Set();
  const protocolHandlers = createWatcherProtocolHandlers({
    topic0,
    updateV2State,
    updateV3SwapState,
    updateV3LiquidityState,
  });
  const pendingStateUpdates = new Map<string, { addr: string; state: any; rawLog: any }>();
  const poolMetaByAddress = new Map<string, any>();

  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];
    const dec = decoded[i];
    if (!dec) continue;
    if (closed()) break;

    const addr = log.address.toLowerCase();
    let pool = poolMetaByAddress.get(addr);
    if (pool === undefined) {
      pool = registry.getPoolMeta(addr) ?? null;
      poolMetaByAddress.set(addr, pool);
    }
    if (!pool) continue;

    let pending = pendingStateUpdates.get(addr);
    if (!pending) {
      pending = {
        addr,
        state: cloneWatcherState(cache.get(addr)),
        rawLog: log,
      };
      pendingStateUpdates.set(addr, pending);
    }

    const state = pending.state;
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
        enqueueEnrichment,
        refreshBalancer,
        refreshCurve,
      })) {
        pending.rawLog = log;
      }
    } catch (err: any) {
      watcherStateLogger.error({ poolAddress: addr, err }, "Watcher state update failed");
      throw new Error(`watcher update failed for ${addr}: ${err?.message ?? err}`);
    }
  }

  if (pendingStateUpdates.size > 0) {
    const committed = commitStates([...pendingStateUpdates.values()]);
    for (const addr of committed) changedAddrs.add(addr);
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
  // Mint body: [sender, amount, amount0, amount1] → amount at index 1
  // Burn body: [amount, amount0, amount1]          → amount at index 0 (no sender)
  const amount = BigInt(isMint ? decoded.body[1].val : decoded.body[0].val);

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

  state.tickVersion = Number.isFinite(Number(state.tickVersion))
    ? Number(state.tickVersion) + 1
    : 1;
}

function cloneWatcherState(state: any) {
  if (!state) return state;
  const cloned = { ...state };
  if (state.ticks instanceof Map) {
    cloned.ticks = new Map(
      [...state.ticks.entries()].map(([tick, data]: any) => [
        tick,
        {
          liquidityGross: data?.liquidityGross ?? 0n,
          liquidityNet: data?.liquidityNet ?? 0n,
        },
      ]),
    );
  }
  return cloned;
}

function validateWatcherStateOrThrow(state: any) {
  const verdict = validatePoolState(state);
  if (!verdict.valid) {
    throw new Error(verdict.reason ?? "invalid watcher state");
  }

  if (state.protocol?.includes("V3")) {
    if (state.liquidity == null || state.liquidity < 0n) {
      throw new Error("V3: negative liquidity");
    }
    if (state.ticks instanceof Map) {
      for (const [tick, data] of state.ticks.entries()) {
        if (data.liquidityGross < 0n) {
          throw new Error(`V3: negative liquidityGross at tick ${tick}`);
        }
      }
    }
  }
}

export function mergeWatcherState(cache: any, addr: any, nextState: any) {
  return mergeStateIntoCache(cache, addr, nextState);
}

export function commitWatcherState(cache: any, persistState: any, addr: any, state: any, rawLog: any) {
  state.timestamp = Date.now();
  validateWatcherStateOrThrow(state);
  cache.set(addr, state);
  persistState(addr, state, rawLog);
}

export function commitWatcherStatesBatch(cache: any, persistStates: any, updates: any[]) {
  if (!Array.isArray(updates) || updates.length === 0) return [];

  const committed: Array<{ pool_address: string; block: number; data: any }> = [];
  const changedAddrs: string[] = [];
  const committedAt = Date.now();

  for (const update of updates) {
    const addr = update?.addr?.toLowerCase?.();
    const state = update?.state;
    if (!addr || !state) continue;
    state.timestamp = committedAt;
    validateWatcherStateOrThrow(state);
    cache.set(addr, state);
    committed.push({
      pool_address: addr,
      block: Number(update?.rawLog?.blockNumber ?? 0),
      data: state,
    });
    changedAddrs.push(addr);
  }

  if (committed.length > 0) {
    persistStates(committed);
  }

  return changedAddrs;
}

export function persistWatcherState(registry: any, addr: any, state: any, rawLog: any, fallbackBlock: any) {
  registry.updatePoolState({
    pool_address: addr,
    block: Number(rawLog?.blockNumber ?? fallbackBlock),
    data: state,
  });
}

export function persistWatcherStates(registry: any, states: any[], fallbackBlock: any) {
  const normalized = states
    .filter((state) => state?.pool_address && state?.data)
    .map((state) => ({
      pool_address: state.pool_address.toLowerCase(),
      block: Number(state.block ?? fallbackBlock),
      data: state.data,
    }));

  if (normalized.length === 0) return;
  registry.batchUpdateStates(normalized);
}

export function reloadWatcherCache(registry: any, cache: any, pendingEnrichment: any) {
  return reloadCacheFromRegistry(registry, cache, pendingEnrichment);
}
