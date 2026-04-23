
/**
 * src/state/watcher_protocol_handlers.js — Topic dispatcher for StateWatcher
 */

export function createWatcherProtocolHandlers({
  topic0,
  updateV2State,
  updateV3SwapState,
  updateV3LiquidityState,
}: any): Map<any, any> {
  return new Map([
    [topic0.V2_SYNC, ({ state, decoded }: any) => {
      updateV2State(state, decoded);
      return true;
    }],
    [topic0.V3_SWAP, ({ state, decoded }: any) => {
      updateV3SwapState(state, decoded);
      return true;
    }],
    [topic0.V3_MINT, ({ state, decoded }: any) => {
      updateV3LiquidityState(state, decoded, true);
      return true;
    }],
    [topic0.V3_BURN, ({ state, decoded }: any) => {
      updateV3LiquidityState(state, decoded, false);
      return true;
    }],
    [topic0.BAL_BALANCE, ({ addr, pool, enqueueEnrichment, refreshBalancer }: any) => {
      enqueueEnrichment(addr, () => refreshBalancer(addr, pool));
      return true;
    }],
    [topic0.CURVE_EXCHANGE_STABLE, ({ addr, pool, enqueueEnrichment, refreshCurve }: any) => {
      enqueueEnrichment(addr, () => refreshCurve(addr, pool));
      return true;
    }],
    [topic0.CURVE_EXCHANGE_CRYPTO, ({ addr, pool, enqueueEnrichment, refreshCurve }: any) => {
      enqueueEnrichment(addr, () => refreshCurve(addr, pool));
      return true;
    }],
  ]);
}
