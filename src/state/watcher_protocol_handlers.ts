
/**
 * src/state/watcher_protocol_handlers.js — Topic dispatcher for StateWatcher
 */

export function createWatcherProtocolHandlers({
  topic0,
  updateV2State,
  updateV3SwapState,
  updateV3LiquidityState,
}: any): Map<any, any> {
  function hasInitializedV3BaseState(state: any) {
    return (
      state?.initialized === true &&
      state?.sqrtPriceX96 != null &&
      state?.sqrtPriceX96 !== 0n &&
      Number.isInteger(state?.tick) &&
      state?.liquidity != null
    );
  }

  return new Map([
    [topic0.V2_SYNC, ({ state, decoded, pool }: any) => {
      updateV2State(state, decoded, pool);
      return true;
    }],
    [topic0.V3_SWAP, ({ state, decoded, pool }: any) => {
      updateV3SwapState(state, decoded, pool);
      return true;
    }],
    [topic0.V3_MINT, ({ addr, log, state, decoded, pool, enqueueEnrichment, refreshV3 }: any) => {
      if (!hasInitializedV3BaseState(state)) {
        enqueueEnrichment(addr, () => refreshV3(addr, pool, log));
        return false;
      }
      updateV3LiquidityState(state, decoded, true, pool);
      return true;
    }],
    [topic0.V3_BURN, ({ addr, log, state, decoded, pool, enqueueEnrichment, refreshV3 }: any) => {
      if (!hasInitializedV3BaseState(state)) {
        enqueueEnrichment(addr, () => refreshV3(addr, pool, log));
        return false;
      }
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
