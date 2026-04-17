// @ts-nocheck
/**
 * src/routing/index.js — Routing module barrel export
 */

// Graph builder
export {
  RoutingGraph,
  buildGraph,
  buildHubGraph,
  POLYGON_HUB_TOKENS,
  HUB_4_TOKENS,
  serializeTopology,
  deserializeTopology,
} from "./graph.ts";

// Path finder
export {
  find2HopPaths,
  find3HopPaths,
  find4HopPathsBidirectional,
  find4HopPaths,              // backward-compat alias
  findArbPaths,
  deduplicatePaths,
  routeKeyFromEdges,
  edgeSpotLogWeight,
  annotatePath,
  pathCumulativeFeesBps,
} from "./finder.ts";

// Cycle enumerator
export {
  enumerateCycles,
  enumerateCyclesDual,
  enumerateCyclesForToken,
  cycleSummary,
} from "./enumerate_cycles.ts";

// Route cache
export { RouteCache } from "./route_cache.ts";

// Route simulator
export {
  simulateHop,
  simulateRoute,
  optimizeInputAmount,
  evaluatePaths,
  evaluatePathsParallel,
} from "./simulator.ts";
