type LogLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace";
type LoggerFn = (msg: string, level?: LogLevel, meta?: unknown) => void;

type StartupCoordinatorDeps<Registry, Repositories, PriceOracle, NonceManager> = {
  log: LoggerFn;
  createRegistry: () => Registry;
  createRepositories: (registry: Registry) => Repositories;
  createPriceOracle: (registry: Registry) => PriceOracle;
  createNonceManager: () => NonceManager;
  setPriceOracle: (oracle: PriceOracle) => void;
  setNonceManager: (nonceManager: NonceManager) => void;
  runInitialDiscovery: () => Promise<unknown>;
  seedStateCache: () => void;
  warmupStateCache: () => Promise<unknown>;
  refreshCycles: (force?: boolean) => Promise<unknown>;
  getCachedCycleCount: () => number;
};

export function createStartupCoordinator<Registry, Repositories, PriceOracle, NonceManager>(
  deps: StartupCoordinatorDeps<Registry, Repositories, PriceOracle, NonceManager>,
) {
  function initializeRuntime() {
    const registry = deps.createRegistry();
    const repositories = deps.createRepositories(registry);
    deps.setPriceOracle(deps.createPriceOracle(registry));
    deps.setNonceManager(deps.createNonceManager());
    return { registry, repositories };
  }

  async function bootstrapRouting() {
    await deps.runInitialDiscovery();
    deps.seedStateCache();
    await deps.warmupStateCache();
    await deps.refreshCycles(true);

    if (deps.getCachedCycleCount() === 0) {
      deps.log(
        "Post-warmup: 0 arbitrage paths enumerated. Hub-pair pools may be unavailable or RPC failed. Watcher replay will populate state incrementally.",
        "warn",
        { event: "warmup_no_paths" },
      );
    }
  }

  return {
    initializeRuntime,
    bootstrapRouting,
  };
}
