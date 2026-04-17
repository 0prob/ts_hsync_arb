// @ts-nocheck
/**
 * src/state/watcher_protocol_handlers.js — Topic dispatcher for StateWatcher
 */

export function createWatcherProtocolHandlers({
  topics,
  updateV2State,
  updateV3SwapState,
  updateV3LiquidityState,
}) {
  return new Map([
    [topics[0], ({ state, decoded, commitState, addr, log }) => {
      updateV2State(state, decoded);
      commitState(addr, state, log);
      return true;
    }],
    [topics[1], ({ state, decoded, commitState, addr, log }) => {
      updateV3SwapState(state, decoded);
      commitState(addr, state, log);
      return true;
    }],
    [topics[2], ({ state, decoded, commitState, addr, log }) => {
      updateV3LiquidityState(state, decoded, true);
      commitState(addr, state, log);
      return true;
    }],
    [topics[3], ({ state, decoded, commitState, addr, log }) => {
      updateV3LiquidityState(state, decoded, false);
      commitState(addr, state, log);
      return true;
    }],
    [topics[4], ({ addr, pool, enqueueEnrichment, refreshBalancer }) => {
      enqueueEnrichment(addr, () => refreshBalancer(addr, pool));
      return true;
    }],
    [topics[5], ({ addr, pool, enqueueEnrichment, refreshCurve }) => {
      enqueueEnrichment(addr, () => refreshCurve(addr, pool));
      return true;
    }],
    [topics[6], ({ addr, pool, enqueueEnrichment, refreshCurve }) => {
      enqueueEnrichment(addr, () => refreshCurve(addr, pool));
      return true;
    }],
  ]);
}
