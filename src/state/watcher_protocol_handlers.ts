
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
    [topic0.V2_SYNC, ({ state, decoded, pool }: any) => {
      updateV2State(state, decoded, pool);
      return true;
    }],
    [topic0.V3_SWAP, ({ state, decoded, pool }: any) => {
      updateV3SwapState(state, decoded, pool);
      return true;
    }],
    [topic0.V3_MINT, ({ state, decoded, pool }: any) => {
      updateV3LiquidityState(state, decoded, true, pool);
      return true;
    }],
    [topic0.V3_BURN, ({ state, decoded, pool }: any) => {
      updateV3LiquidityState(state, decoded, false, pool);
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
