import assert from "node:assert/strict";

import { createTopologyRefreshCoordinator } from "../src/runtime/topology_refresh.ts";

{
  let updateCalls = 0;
  let refreshOptions: any = null;
  const clearedReasons: string[] = [];

  const coordinator = createTopologyRefreshCoordinator({
    getPriceOracle: () => ({
      isFresh: () => false,
      update: () => {
        updateCalls++;
      },
      getFreshRate: (address: string, maxAgeMs: number) => {
        assert.equal(address, "0xtoken");
        assert.equal(maxAgeMs, 30_000);
        return 7n;
      },
    }),
    getTopologyService: () => ({
      refreshCycles: async (options) => {
        refreshOptions = options;
        options.clearExecutionRouteQuarantine?.("topology_changed");
        return [];
      },
    }),
    clearExecutionRouteQuarantine: (reason: string) => {
      clearedReasons.push(reason);
    },
    maxPriceAgeMs: 30_000,
    minLiquidityWmatic: 123n,
    selective4HopPathBudget: 456,
    selective4HopMaxPathsPerToken: 789,
  });

  await coordinator.refreshCycles(true);

  assert.equal(updateCalls, 1, "topology refresh should refresh stale price-oracle data before building liquidity-ranked paths");
  assert.equal(refreshOptions.force, true);
  assert.equal(refreshOptions.minLiquidityWmatic, 123n);
  assert.equal(refreshOptions.selective4HopPathBudget, 456);
  assert.equal(refreshOptions.selective4HopMaxPathsPerToken, 789);
  assert.equal(refreshOptions.getRateWei("0xtoken"), 7n, "topology refresh should expose the oracle rate adapter to topology service");
  assert.deepEqual(clearedReasons, ["topology_changed"], "topology refresh should preserve execution-quarantine clearing");
}

{
  let updateCalls = 0;

  const coordinator = createTopologyRefreshCoordinator({
    getPriceOracle: () => ({
      isFresh: () => true,
      update: () => {
        updateCalls++;
      },
      getFreshRate: () => 1n,
    }),
    getTopologyService: () => null,
    clearExecutionRouteQuarantine: () => {},
    maxPriceAgeMs: 30_000,
    minLiquidityWmatic: 1n,
    selective4HopPathBudget: 1,
    selective4HopMaxPathsPerToken: 1,
  });

  coordinator.refreshPriceOracleIfStale();
  await coordinator.refreshCycles();

  assert.equal(updateCalls, 0, "fresh price-oracle data should not be refreshed redundantly");
}

console.log("Topology refresh checks passed.");
