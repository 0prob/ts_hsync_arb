
/**
 * src/routing/worker.ts — One-shot worker wrapper
 *
 * Kept for compatibility with any older call sites that still spawn this file
 * directly instead of using the persistent worker pool.
 */

import { parentPort, workerData } from "worker_threads";
import { evaluatePaths } from "./simulator.ts";

if (!parentPort) {
  throw new Error("worker.ts must run in a Worker thread");
}

try {
  const { paths, stateObj, testAmount, options } = workerData || {};
  const stateCache =
    stateObj instanceof Map ? stateObj : new Map(Object.entries(stateObj || {}));

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
