import { RouteCache } from "../routing/route_cache.ts";
import type { BotState } from "../tui/types.ts";
import type { NonceManager } from "../execution/nonce_manager.ts";
import type { PriceOracle } from "../profit/price_oracle.ts";
import type { StateWatcher } from "../state/watcher.ts";

type RuntimeContextOptions = {
  routeCacheSize?: number;
  initialBotState: BotState;
};

export type RuntimeState = Record<string, any>;
export type RuntimeStateCache = Map<string, RuntimeState>;

type ManagedRuntimeState = {
  watcher: StateWatcher | null;
  priceOracle: PriceOracle | null;
  nonceManager: NonceManager | null;
};

export function createRuntimeContext(options: RuntimeContextOptions) {
  const stateCache: RuntimeStateCache = new Map();
  const routeCache = new RouteCache(options.routeCacheSize ?? 1_000);
  const botState = options.initialBotState;

  let running = true;
  const managedState: ManagedRuntimeState = {
    watcher: null,
    priceOracle: null,
    nonceManager: null,
  };
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
    getWatcher: () => managedState.watcher,
    setWatcher: (next: StateWatcher | null) => {
      managedState.watcher = next;
    },
    getPriceOracle: () => managedState.priceOracle,
    setPriceOracle: (next: PriceOracle | null) => {
      managedState.priceOracle = next;
    },
    getNonceManager: () => managedState.nonceManager,
    setNonceManager: (next: NonceManager | null) => {
      managedState.nonceManager = next;
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
