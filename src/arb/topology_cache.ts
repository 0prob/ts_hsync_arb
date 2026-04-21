import { toFiniteNumber as normaliseLogWeight } from "../util/bigint.ts";
import { routeIdentityFromSerializedPath } from "../routing/route_identity.ts";

export type SerializedPathLike = {
  startToken: string;
  poolAddresses: string[];
  tokenIns: string[];
  tokenOuts: string[];
  zeroForOnes: boolean[];
  hopCount: number;
  logWeight: unknown;
  cumulativeFeesBps?: number;
};

export type ArbPathLike = {
  startToken: string;
  edges: Array<{
    poolAddress: string;
    tokenIn: string;
    tokenOut: string;
    protocol: string;
    zeroForOne: boolean;
  }>;
  hopCount: number;
  logWeight: unknown;
  cumulativeFeesBps?: number;
};

export function createTopologyCache(maxTotalPaths: number) {
  let cachedHubTopology: Record<string, any[]> | null = null;
  let cachedFullTopology: Record<string, any[]> | null = null;
  let cachedHubTopologyGraph: any = null;
  let cachedFullTopologyGraph: any = null;

  function invalidateSerializedTopologies() {
    cachedHubTopology = null;
    cachedFullTopology = null;
    cachedHubTopologyGraph = null;
    cachedFullTopologyGraph = null;
  }

  function getSerializedTopologyCached(
    kind: "hub" | "full",
    graph: any,
    serializeTopology: (graph: any) => Record<string, any[]>,
  ) {
    if (kind === "hub") {
      if (cachedHubTopologyGraph !== graph || !cachedHubTopology) {
        cachedHubTopology = serializeTopology(graph);
        cachedHubTopologyGraph = graph;
      }
      return cachedHubTopology;
    }

    if (cachedFullTopologyGraph !== graph || !cachedFullTopology) {
      cachedFullTopology = serializeTopology(graph);
      cachedFullTopologyGraph = graph;
    }
    return cachedFullTopology;
  }

  function hydratePaths(serialised: SerializedPathLike[], hub: any, full: any) {
    const paths: ArbPathLike[] = [];
    const seen = new Set<string>();

    for (const s of serialised) {
      const key = routeIdentityFromSerializedPath(
        s.startToken,
        s.poolAddresses,
        s.tokenIns,
        s.tokenOuts,
      );
      if (seen.has(key)) continue;
      seen.add(key);

      const edges = [];
      let ok = true;
      for (let i = 0; i < s.poolAddresses.length; i++) {
        const pool = s.poolAddresses[i];
        const tokenIn = s.tokenIns[i];
        const tokenOut = s.tokenOuts[i];
        const candidate =
          hub.getPoolEdge(pool, tokenIn, tokenOut) ||
          full.getPoolEdge(pool, tokenIn, tokenOut);
        if (!candidate) {
          ok = false;
          break;
        }
        edges.push(candidate);
      }

      if (ok && edges.length === s.poolAddresses.length) {
        paths.push({
          startToken: s.startToken,
          edges,
          hopCount: s.hopCount,
          logWeight: s.logWeight,
          cumulativeFeesBps: s.cumulativeFeesBps,
        });
      }
    }

    paths.sort((a, b) => normaliseLogWeight(a.logWeight) - normaliseLogWeight(b.logWeight));
    return paths.length > maxTotalPaths ? paths.slice(0, maxTotalPaths) : paths;
  }

  return {
    getSerializedTopologyCached,
    hydratePaths,
    invalidateSerializedTopologies,
  };
}
