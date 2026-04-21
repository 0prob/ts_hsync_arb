type DiscoveryDeps = {
  discoverPools: () => Promise<any>;
  log: (msg: string, level?: "fatal" | "error" | "warn" | "info" | "debug" | "trace", meta?: any) => void;
  discoveryIntervalMs: number;
};

export function createDiscoveryCoordinator(deps: DiscoveryDeps) {
  let lastDiscoveryMs = 0;
  let discoveryInFlight = false;

  async function maybeRunDiscovery(force = false): Promise<any> {
    const now = Date.now();
    if (discoveryInFlight) return null;
    if (!force && now - lastDiscoveryMs < deps.discoveryIntervalMs) return null;

    discoveryInFlight = true;

    try {
      deps.log("Background discovery starting...", "info", {
        event: "discovery_start",
        forced: force,
      });
      const result = await deps.discoverPools();
      lastDiscoveryMs = Date.now();
      deps.log(`Background discovery complete: ${result.totalDiscovered} new pools`, "info", {
        event: "discovery_complete",
        forced: force,
        totalDiscovered: result.totalDiscovered,
        activePools: result.activePools,
      });
      return result;
    } catch (err: any) {
      deps.log(`Background discovery failed: ${err.message}`, "warn", {
        event: "discovery_failed",
        forced: force,
        err,
      });
      return null;
    } finally {
      discoveryInFlight = false;
    }
  }

  async function runInitialDiscovery() {
    deps.log("Initial pool discovery...");
    try {
      const result = await deps.discoverPools();
      lastDiscoveryMs = Date.now();
      deps.log(`Discovery: ${result.totalDiscovered} new, ${result.activePools} active`);
      return result;
    } catch (err: any) {
      deps.log(`Initial discovery failed: ${err.message} — using cached state`, "warn");
      return null;
    }
  }

  return {
    maybeRunDiscovery,
    runInitialDiscovery,
  };
}
