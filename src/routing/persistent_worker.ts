
/**
 * src/routing/persistent_worker.ts — Long-lived simulation + enumeration worker
 *
 * Handles two message types:
 *
 *   EVALUATE  { id, paths, stateObj, testAmount, options }
 *     Simulate a batch of paths against the provided state snapshot.
 *     Returns profitable paths sorted by profit desc.
 *
 *   ENUMERATE { id, adjacency, startTokens, options }
 *     Reconstruct a lightweight topology-only graph from `adjacency`
 *     (output of serializeTopology) and run findArbPaths on `startTokens`.
 *     Returns serialisable path descriptors (pool arrays, no functions).
 *     The main thread then looks up full edges from the live graph.
 */

import { parentPort } from "worker_threads";
import { evaluatePaths } from "./simulator.ts";
import { findArbPaths } from "./finder.ts";
import { deserializeTopology } from "./graph.ts";

if (!parentPort) throw new Error("persistent_worker must run in a Worker thread");

const workerStateMap = new Map();
let cachedTopologyKey: any = null;
let cachedTopologyGraph: any = null;

parentPort!.on("message", ({ type = "EVALUATE", id, ...payload }) => {
  try {
    if (type === "SYNC_STATE") {
      const { stateObj } = payload;
      for (const [poolAddress, state] of Object.entries(stateObj || {})) {
        workerStateMap.set(poolAddress, state);
      }
      parentPort!.postMessage({ id, type: "SYNC_STATE" });

    } else if (type === "SYNC_TOPOLOGY") {
      const { adjacency, topologyKey } = payload;
      cachedTopologyGraph = deserializeTopology(adjacency);
      cachedTopologyKey = topologyKey ?? null;
      parentPort!.postMessage({ id, type: "SYNC_TOPOLOGY" });

    } else if (type === "EVALUATE") {
      const { paths, stateObj, testAmount, options } = payload;
      if (stateObj) {
        const incoming = stateObj instanceof Map
          ? stateObj
          : new Map(Object.entries(stateObj));
        for (const [poolAddress, state] of incoming) {
          workerStateMap.set(poolAddress, state);
        }
      }

      const profitable = evaluatePaths(paths, workerStateMap, BigInt(testAmount), options || {});
      parentPort!.postMessage({ id, type: "EVALUATE", profitable });

    } else if (type === "ENUMERATE") {
      const { adjacency, topologyKey, startTokens, options } = payload;
      let graph = cachedTopologyGraph;

      if (adjacency) {
        if (!graph || (topologyKey != null && topologyKey !== cachedTopologyKey)) {
          graph = deserializeTopology(adjacency);
          cachedTopologyGraph = graph;
          cachedTopologyKey = topologyKey ?? null;
        }
      }

      if (!graph) {
        throw new Error("ENUMERATE received no cached topology");
      }

      const paths = findArbPaths(graph, startTokens, options || {});
      const serialised = paths.map((p: any) => ({
        startToken: p.startToken,
        hopCount: p.hopCount,
        logWeight: p.logWeight,
        cumulativeFeesBps: p.cumulativeFeesBps,
        poolAddresses: p.edges.map((e: any) => e.poolAddress),
        zeroForOnes: p.edges.map((e: any) => e.zeroForOne),
      }));
      parentPort!.postMessage({ id, type: "ENUMERATE", paths: serialised });

    } else {
      parentPort!.postMessage({ id, error: `Unknown message type: ${type}` });
    }
  } catch (err: any) {
    parentPort!.postMessage({ id, error: err.message });
  }
});
