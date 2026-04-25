
/**
 * src/routing/worker.ts — One-shot worker wrapper
 *
 * Kept for compatibility with any older call sites that still spawn this file
 * directly instead of using the persistent worker pool.
 */

import { parentPort, workerData } from "worker_threads";
import { evaluatePaths } from "./simulator.ts";
import { rehydrateStateData } from "../db/registry_codec.ts";
import { normalizeEvmAddress } from "../util/pool_record.ts";

if (!parentPort) {
  throw new Error("worker.ts must run in a Worker thread");
}

try {
  const { paths, stateObj, testAmount, options } = workerData || {};
  const incoming = stateObj instanceof Map ? stateObj : new Map(Object.entries(stateObj || {}));
  const stateCache = new Map();
  for (const [poolAddress, state] of incoming) {
    const normalizedPool = normalizeEvmAddress(poolAddress);
    if (!normalizedPool) continue;
    rehydrateStateData(state.protocol, state);
    stateCache.set(normalizedPool, state);
  }

  const profitable = evaluatePaths(
    paths || [],
    stateCache,
    BigInt(testAmount ?? 0),
    options || {}
  );

  parentPort.postMessage({ profitable });
} catch (err: any) {
  parentPort.postMessage({ error: err.message });
}
