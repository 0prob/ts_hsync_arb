import { RouteCache } from "../routing/route_cache.ts";
import type { BotState } from "../tui/types.ts";

type RuntimeContextOptions = {
  routeCacheSize?: number;
  initialBotState: BotState;
};

export function createRuntimeContext(options: RuntimeContextOptions) {
  const stateCache = new Map<string, Record<string, any>>();
  const routeCache = new RouteCache(options.routeCacheSize ?? 1_000);
  const botState = options.initialBotState;

  let running = true;
  let watcher: any = null;
  let priceOracle: any = null;
  let nonceManager: any = null;
  let passCount = 0;
  let consecutiveErrors = 0;

  return {
    stateCache,
    routeCache,
    botState,
    isRunning: () => running,
    setRunning: (next: boolean) => {
      running = next;
    },
    getWatcher: () => watcher,
    setWatcher: (next: any) => {
      watcher = next;
    },
    getPriceOracle: () => priceOracle,
    setPriceOracle: (next: any) => {
      priceOracle = next;
    },
    getNonceManager: () => nonceManager,
    setNonceManager: (next: any) => {
      nonceManager = next;
    },
    getPassCount: () => passCount,
    incrementPassCount: () => {
      passCount += 1;
      return passCount;
    },
    setPassCount: (next: number) => {
      passCount = next;
    },
    getConsecutiveErrors: () => consecutiveErrors,
    setConsecutiveErrors: (next: number) => {
      consecutiveErrors = next;
    },
    resetConsecutiveErrors: () => {
      consecutiveErrors = 0;
    },
    incrementConsecutiveErrors: () => {
      consecutiveErrors += 1;
      return consecutiveErrors;
    },
  };
}
