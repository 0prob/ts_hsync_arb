import fs from "node:fs";
import path from "node:path";

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

type PersistentRouteCycleCache = {
  version: 1;
  cacheKey: string;
  writtenAt: number;
  paths: SerializedPathLike[];
};

function normalizeSerializedPath(serialised: SerializedPathLike | null | undefined) {
  if (typeof serialised?.startToken !== "string") return null;
  const startToken = serialised.startToken.trim().toLowerCase();
  if (!startToken) return null;
  if (!Array.isArray(serialised.poolAddresses)) return null;
  if (!Array.isArray(serialised.tokenIns)) return null;
  if (!Array.isArray(serialised.tokenOuts)) return null;
  if (serialised.zeroForOnes != null && !Array.isArray(serialised.zeroForOnes)) return null;

  const expectedHops = serialised.poolAddresses.length;
  if (
    serialised.tokenIns.length !== expectedHops ||
    serialised.tokenOuts.length !== expectedHops ||
    (serialised.zeroForOnes != null && serialised.zeroForOnes.length !== expectedHops) ||
    expectedHops === 0
  ) {
    return null;
  }

  const poolAddresses: string[] = [];
  const tokenIns: string[] = [];
  const tokenOuts: string[] = [];
  const zeroForOnes = serialised.zeroForOnes ?? [];

  for (let i = 0; i < expectedHops; i++) {
    const poolAddress = serialised.poolAddresses[i];
    const tokenIn = serialised.tokenIns[i];
    const tokenOut = serialised.tokenOuts[i];
    const zeroForOne = zeroForOnes[i];
    if (typeof poolAddress !== "string" || typeof tokenIn !== "string" || typeof tokenOut !== "string") {
      return null;
    }
    const normalizedPool = poolAddress.trim().toLowerCase();
    const normalizedTokenIn = tokenIn.trim().toLowerCase();
    const normalizedTokenOut = tokenOut.trim().toLowerCase();
    if (!normalizedPool || !normalizedTokenIn || !normalizedTokenOut) return null;
    if (serialised.zeroForOnes != null && typeof zeroForOne !== "boolean") return null;
    poolAddresses.push(normalizedPool);
    tokenIns.push(normalizedTokenIn);
    tokenOuts.push(normalizedTokenOut);
  }

  if (tokenIns[0] !== startToken) return null;
  if (tokenOuts[tokenOuts.length - 1] !== startToken) return null;

  return {
    startToken,
    poolAddresses,
    tokenIns,
    tokenOuts,
    zeroForOnes: serialised.zeroForOnes == null ? null : zeroForOnes,
    logWeight: serialised.logWeight,
    cumulativeFeesBps: serialised.cumulativeFeesBps,
  };
}

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

    for (const raw of serialised) {
      const s = normalizeSerializedPath(raw);
      if (!s) continue;

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
        if (!candidate || (s.zeroForOnes != null && candidate.zeroForOne !== s.zeroForOnes[i])) {
          ok = false;
          break;
        }
        edges.push(candidate);
      }

      if (ok && edges.length === s.poolAddresses.length) {
        paths.push({
          startToken: s.startToken,
          edges,
          hopCount: edges.length,
          logWeight: s.logWeight,
          cumulativeFeesBps: s.cumulativeFeesBps,
        });
      }
    }

    paths.sort((a, b) => normaliseLogWeight(a.logWeight) - normaliseLogWeight(b.logWeight));
    return paths.length > maxTotalPaths ? paths.slice(0, maxTotalPaths) : paths;
  }

  function serializePaths(paths: ArbPathLike[]): SerializedPathLike[] {
    return paths.map((path) => ({
      startToken: path.startToken,
      poolAddresses: path.edges.map((edge) => edge.poolAddress),
      tokenIns: path.edges.map((edge) => edge.tokenIn),
      tokenOuts: path.edges.map((edge) => edge.tokenOut),
      zeroForOnes: path.edges.map((edge) => edge.zeroForOne),
      hopCount: path.hopCount,
      logWeight: typeof path.logWeight === "bigint" ? path.logWeight.toString() : path.logWeight,
      cumulativeFeesBps: path.cumulativeFeesBps,
    }));
  }

  function readPersistentRouteCycles(cacheFile: string | null | undefined, cacheKey: string) {
    if (!cacheFile) return { hit: false, paths: [] as SerializedPathLike[] };
    try {
      const parsed = JSON.parse(fs.readFileSync(cacheFile, "utf8")) as PersistentRouteCycleCache;
      if (parsed?.version !== 1 || parsed.cacheKey !== cacheKey || !Array.isArray(parsed.paths)) {
        return { hit: false, paths: [] as SerializedPathLike[] };
      }
      return { hit: true, paths: parsed.paths };
    } catch {
      return { hit: false, paths: [] as SerializedPathLike[] };
    }
  }

  function writePersistentRouteCycles(
    cacheFile: string | null | undefined,
    cacheKey: string,
    paths: ArbPathLike[],
  ) {
    if (!cacheFile) return false;
    if (paths.length === 0) return false;
    try {
      fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
      const payload: PersistentRouteCycleCache = {
        version: 1,
        cacheKey,
        writtenAt: Date.now(),
        paths: serializePaths(paths),
      };
      fs.writeFileSync(cacheFile, `${JSON.stringify(payload)}\n`);
      return true;
    } catch {
      return false;
    }
  }

  return {
    getSerializedTopologyCached,
    hydratePaths,
    invalidateSerializedTopologies,
    readPersistentRouteCycles,
    writePersistentRouteCycles,
  };
}
