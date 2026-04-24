import assert from "node:assert/strict";

import { createStartupCoordinator } from "../src/runtime/startup.ts";

{
  const events: string[] = [];
  const logs: Array<{ msg: string; meta: any }> = [];

  const coordinator = createStartupCoordinator({
    log: (msg, _level, meta) => {
      logs.push({ msg, meta });
    },
    createRegistry: () => {
      events.push("createRegistry");
      return { id: "registry" };
    },
    createRepositories: (registry) => {
      events.push(`createRepositories:${registry.id}`);
      return { id: "repositories" };
    },
    createPriceOracle: (registry) => {
      events.push(`createPriceOracle:${registry.id}`);
      return { id: "oracle" };
    },
    createNonceManager: () => {
      events.push("createNonceManager");
      return { id: "nonce" };
    },
    setPriceOracle: (oracle) => {
      events.push(`setPriceOracle:${oracle.id}`);
    },
    setNonceManager: (nonceManager) => {
      events.push(`setNonceManager:${nonceManager.id}`);
    },
    runInitialDiscovery: async () => {
      events.push("runInitialDiscovery");
    },
    seedStateCache: () => {
      events.push("seedStateCache");
    },
    warmupStateCache: async () => {
      events.push("warmupStateCache");
    },
    refreshCycles: async (force = false) => {
      events.push(`refreshCycles:${force}`);
    },
    getCachedCycleCount: () => 0,
  });

  const initialized = coordinator.initializeRuntime();
  await coordinator.bootstrapRouting();

  assert.equal(initialized.registry.id, "registry");
  assert.equal(initialized.repositories.id, "repositories");
  assert.deepEqual(events, [
    "createRegistry",
    "createRepositories:registry",
    "createPriceOracle:registry",
    "setPriceOracle:oracle",
    "createNonceManager",
    "setNonceManager:nonce",
    "runInitialDiscovery",
    "seedStateCache",
    "warmupStateCache",
    "refreshCycles:true",
  ]);
  assert.equal(logs.some(({ meta }) => meta?.event === "warmup_no_paths"), true);
}

{
  const logs: Array<{ msg: string; meta: any }> = [];

  const coordinator = createStartupCoordinator({
    log: (msg, _level, meta) => {
      logs.push({ msg, meta });
    },
    createRegistry: () => ({}),
    createRepositories: () => ({}),
    createPriceOracle: () => ({}),
    createNonceManager: () => ({}),
    setPriceOracle: () => {},
    setNonceManager: () => {},
    runInitialDiscovery: async () => {},
    seedStateCache: () => {},
    warmupStateCache: async () => {},
    refreshCycles: async () => {},
    getCachedCycleCount: () => 2,
  });

  await coordinator.bootstrapRouting();

  assert.equal(logs.length, 0, "startup should not warn when warmup produced cached paths");
}

console.log("Startup checks passed.");
