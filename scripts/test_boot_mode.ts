import assert from "node:assert/strict";

import { createBootModeCoordinator } from "../src/runtime/boot_mode.ts";

{
  const events: string[] = [];
  let stopTui: (() => void) | null = null;

  const coordinator = createBootModeCoordinator({
    botState: { status: "idle" },
    setBotStatus: (status) => {
      events.push(`status:${status}`);
    },
    setStopTui: (next) => {
      stopTui = next;
      events.push(`setStopTui:${next ? "fn" : "null"}`);
    },
    startTui: async () => {
      events.push("startTui");
      return () => {};
    },
    startMetricsServer: () => {
      events.push("startMetricsServer");
    },
    printBanner: () => {
      events.push("printBanner");
    },
    loopMode: false,
    discoveryOnly: false,
    envioApiToken: null,
    runPass: async () => {
      events.push("runPass");
    },
    shutdown: async () => {
      events.push("shutdown");
    },
    createWatcher: () => ({
      start: async () => {},
      wait: async () => {},
      haltMeta: null,
    }),
    setWatcher: () => {},
    configureWatcher: () => {},
    log: () => {},
    fastArbDebounceMs: 50,
    baseArbDebounceMs: 200,
    heartbeatIntervalMs: 30_000,
    formatDuration: () => "30s",
    setWatcherHealthy: () => {},
    startHeartbeat: () => {},
    scheduleArb: () => {},
    stopHeartbeat: () => {},
  });

  await coordinator.startOperatorSurface(true);

  assert.equal(typeof stopTui, "function");
  assert.deepEqual(events, ["status:running", "startTui", "setStopTui:fn"]);
}

{
  const events: string[] = [];

  const coordinator = createBootModeCoordinator({
    botState: { status: "idle" },
    setBotStatus: (status) => {
      events.push(`status:${status}`);
    },
    setStopTui: () => {},
    startTui: async () => () => {},
    startMetricsServer: () => {
      events.push("startMetricsServer");
    },
    printBanner: () => {
      events.push("printBanner");
    },
    loopMode: false,
    discoveryOnly: false,
    envioApiToken: null,
    runPass: async () => {},
    shutdown: async () => {},
    createWatcher: () => ({
      start: async () => {},
      wait: async () => {},
      haltMeta: null,
    }),
    setWatcher: () => {},
    configureWatcher: () => {},
    log: () => {},
    fastArbDebounceMs: 50,
    baseArbDebounceMs: 200,
    heartbeatIntervalMs: 30_000,
    formatDuration: () => "30s",
    setWatcherHealthy: () => {},
    startHeartbeat: () => {},
    scheduleArb: () => {},
    stopHeartbeat: () => {},
  });

  await coordinator.startOperatorSurface(false);

  assert.deepEqual(events, ["status:running", "startMetricsServer", "printBanner"]);
}

{
  const events: string[] = [];

  const coordinator = createBootModeCoordinator({
    botState: { status: "idle" },
    setBotStatus: () => {},
    setStopTui: () => {},
    startTui: async () => () => {},
    startMetricsServer: () => {},
    printBanner: () => {},
    loopMode: false,
    discoveryOnly: false,
    envioApiToken: null,
    runPass: async () => {
      events.push("runPass");
    },
    shutdown: async () => {
      events.push("shutdown");
    },
    createWatcher: () => ({
      start: async () => {},
      wait: async () => {},
      haltMeta: null,
    }),
    setWatcher: () => {},
    configureWatcher: () => {},
    log: () => {},
    fastArbDebounceMs: 50,
    baseArbDebounceMs: 200,
    heartbeatIntervalMs: 30_000,
    formatDuration: () => "30s",
    setWatcherHealthy: () => {},
    startHeartbeat: () => {},
    scheduleArb: () => {},
    stopHeartbeat: () => {},
  });

  await coordinator.runAfterBootstrap();
  assert.deepEqual(events, ["runPass", "shutdown"]);
}

{
  const events: string[] = [];

  const coordinator = createBootModeCoordinator({
    botState: { status: "idle" },
    setBotStatus: () => {},
    setStopTui: () => {},
    startTui: async () => () => {},
    startMetricsServer: () => {},
    printBanner: () => {},
    loopMode: false,
    discoveryOnly: true,
    envioApiToken: null,
    runPass: async () => {
      events.push("runPass");
    },
    shutdown: async () => {
      events.push("shutdown");
    },
    createWatcher: () => ({
      start: async () => {},
      wait: async () => {},
      haltMeta: null,
    }),
    setWatcher: () => {},
    configureWatcher: () => {},
    log: () => {},
    fastArbDebounceMs: 50,
    baseArbDebounceMs: 200,
    heartbeatIntervalMs: 30_000,
    formatDuration: () => "30s",
    setWatcherHealthy: () => {},
    startHeartbeat: () => {},
    scheduleArb: () => {},
    stopHeartbeat: () => {},
  });

  await coordinator.runAfterBootstrap();
  assert.deepEqual(events, ["shutdown"], "discovery-only mode should skip the first arb pass");
}

{
  const coordinator = createBootModeCoordinator({
    botState: { status: "idle" },
    setBotStatus: () => {},
    setStopTui: () => {},
    startTui: async () => () => {},
    startMetricsServer: () => {},
    printBanner: () => {},
    loopMode: true,
    discoveryOnly: false,
    envioApiToken: null,
    runPass: async () => {},
    shutdown: async () => {},
    createWatcher: () => ({
      start: async () => {},
      wait: async () => {},
      haltMeta: null,
    }),
    setWatcher: () => {},
    configureWatcher: () => {},
    log: () => {},
    fastArbDebounceMs: 50,
    baseArbDebounceMs: 200,
    heartbeatIntervalMs: 30_000,
    formatDuration: () => "30s",
    setWatcherHealthy: () => {},
    startHeartbeat: () => {},
    scheduleArb: () => {},
    stopHeartbeat: () => {},
  });

  await assert.rejects(
    () => coordinator.runAfterBootstrap(),
    /ENVIO_API_TOKEN is required for --loop watcher mode/,
  );
}

{
  const events: string[] = [];
  const watcher = {
    haltMeta: null as { reason?: unknown } | null,
    start: async () => {
      events.push("watcher.start");
    },
    wait: async () => {
      events.push("watcher.wait");
    },
  };

  const coordinator = createBootModeCoordinator({
    botState: { status: "idle" },
    setBotStatus: () => {},
    setStopTui: () => {},
    startTui: async () => () => {},
    startMetricsServer: () => {},
    printBanner: () => {},
    loopMode: true,
    discoveryOnly: false,
    envioApiToken: "token",
    runPass: async () => {},
    shutdown: async () => {},
    createWatcher: () => watcher,
    setWatcher: () => {
      events.push("setWatcher");
    },
    configureWatcher: () => {
      events.push("configureWatcher");
    },
    log: (_msg, _level, meta) => {
      events.push(`log:${String((meta as { event?: string } | undefined)?.event ?? "none")}`);
    },
    fastArbDebounceMs: 50,
    baseArbDebounceMs: 200,
    heartbeatIntervalMs: 30_000,
    formatDuration: () => "30s",
    setWatcherHealthy: () => {
      events.push("setWatcherHealthy");
    },
    startHeartbeat: () => {
      events.push("startHeartbeat");
    },
    scheduleArb: () => {
      events.push("scheduleArb");
    },
    stopHeartbeat: () => {
      events.push("stopHeartbeat");
    },
  });

  await coordinator.runAfterBootstrap();

  assert.deepEqual(events, [
    "setWatcher",
    "configureWatcher",
    "log:watcher_start",
    "watcher.start",
    "setWatcherHealthy",
    "startHeartbeat",
    "scheduleArb",
    "watcher.wait",
    "stopHeartbeat",
  ]);
}

console.log("Boot mode checks passed.");
