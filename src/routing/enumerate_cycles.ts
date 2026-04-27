
/**
 * src/routing/enumerate_cycles.js — Arbitrage cycle enumerator
 *
 * Two entry points:
 *
 *  enumerateCycles(graph, opts)
 *    Single-graph (backward-compatible). Hub tokens as start, configurable depth.
 *
 *  enumerateCyclesDual(hubGraph, fullGraph, opts)
 *    Dual-graph hub-first. Phase 1: HUB_4_TOKENS + 4-hop bidirectional BFS.
 *    Phase 2: full POLYGON_HUB_TOKENS + 3-hop only (4-hop too expensive there).
 *
 * Sorting: logWeight ascending (most-negative = highest spot profit).
 * logWeight < 0 is the per-path Bellman-Ford criterion: the cycle is
 * profitable at spot price. Simulation confirms and sizes the optimal trade.
 * Paths with logWeight === 0 (state unknown) are placed last.
 *
 * Liquidity floor ($5k USD):
 *   When minLiquidityWmatic > 0 and getRateWei is provided, pools whose
 *   estimated TVL in WMATIC-wei is known and below threshold are pruned.
 *   $5 000 at $0.70/WMATIC ≈ 7_143n * 10n**18n.
 */

import { findArbPaths, deduplicatePaths } from "./finder.ts";
import { POLYGON_HUB_TOKENS, HUB_4_TOKENS } from "./graph.ts";
import { poolLiquidityWmatic } from "./liquidity.ts";
import { toFiniteNumber as normaliseLogWeight } from "../util/bigint.ts";
import { takeTopNBy } from "../util/bounded_priority.ts";

// ─── Defaults ────────────────────────────────────────────────

const DEFAULTS = {
  include2Hop:          true,
  include3Hop:          true,
  include4Hop:          false,
  maxHops:              4,
  maxPathsPerToken:     5_000,
  max4HopPathsPerToken: 2_000,
  maxTotalPaths:        20_000,
  hubTokensOnly:        true,
  dedup:                true,
  minV2Reserve:         0n,
  probeWei:             0n,
  minLiquidityWmatic:   0n,
  getRateWei:           null,
};


function pruneByLiquidity(paths: any, minWmatic: any, getRateWei: any) {
  if (minWmatic <= 0n || !getRateWei) return paths;
  return paths.filter((path: any) => {
    for (const edge of path.edges) {
      const liq = poolLiquidityWmatic(edge, getRateWei);
      if (liq > 0n && liq < minWmatic) return false;
    }
    return true;
  });
}

// ─── Sort ─────────────────────────────────────────────────────

function compareByLogWeight(a: any, b: any) {
  const noA = a.logWeight === 0 && a.edges.some((e: any) => !e.stateRef);
  const noB = b.logWeight === 0 && b.edges.some((e: any) => !e.stateRef);
  if (noA && !noB) return 1;
  if (!noA && noB) return -1;
  return normaliseLogWeight(a.logWeight) - normaliseLogWeight(b.logWeight);
}

function sortByLogWeight(paths: any) {
  return paths.sort(compareByLogWeight);
}

function normalizePathBudget(value: any) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.floor(numeric);
}

function selectTopPaths(paths: any, limit: number) {
  const normalizedLimit = normalizePathBudget(limit);
  if (normalizedLimit <= 0) return [];
  if (paths.length <= normalizedLimit) return sortByLogWeight(paths);
  return takeTopNBy(paths, normalizedLimit, compareByLogWeight);
}

function resolvePhaseBudget(rawBudget: number | undefined, maxTotal: number, fallbackRatio: number) {
  const normalizedMax = normalizePathBudget(maxTotal);
  if (normalizedMax <= 0) return 0;
  const fallback = Math.ceil(normalizedMax * fallbackRatio);
  const requested = rawBudget ?? fallback;
  const requestedBudget = normalizePathBudget(requested);
  return Math.max(0, Math.min(normalizedMax, requestedBudget));
}

// ─── Single-graph (backward-compatible) ──────────────────────

export function enumerateCycles(graph: any, options: any = {}) {
  const opts = { ...DEFAULTS, ...options };
  const maxTotal = normalizePathBudget(opts.maxTotalPaths);
  if (maxTotal <= 0) return [];

  let startTokens;
  if (opts.startTokens) {
    startTokens = opts.startTokens;
  } else if (opts.hubTokensOnly) {
    startTokens = new Set([...POLYGON_HUB_TOKENS].filter((t) => graph.hasToken(t)));
  } else {
    startTokens = graph.tokens;
  }

  if (startTokens.size === 0) {
    console.warn("[enumerate_cycles] No valid start tokens in graph");
    return [];
  }

  let paths = findArbPaths(graph, startTokens, {
    include2Hop:          opts.include2Hop,
    include3Hop:          opts.include3Hop,
    include4Hop:          opts.include4Hop,
    maxHops:              opts.maxHops,
    maxPathsPerToken:     opts.maxPathsPerToken,
    max4HopPathsPerToken: opts.max4HopPathsPerToken,
    minV2Reserve:         opts.minV2Reserve,
    probeWei:             opts.probeWei,
  });

  if (opts.dedup) paths = deduplicatePaths(paths);
  if (opts.minLiquidityWmatic > 0n && opts.getRateWei) {
    paths = pruneByLiquidity(paths, opts.minLiquidityWmatic, opts.getRateWei);
  }
  return selectTopPaths(paths, maxTotal);
}

// ─── Dual-graph hub-first (preferred) ────────────────────────

export function enumerateCyclesDual(hubGraph: any, fullGraph: any, options: any = {}) {
  const opts      = { ...DEFAULTS, ...options };
  const maxTotal  = normalizePathBudget(opts.maxTotalPaths);
  if (maxTotal <= 0) return [];
  const hubBudget = resolvePhaseBudget(opts.hubPathBudget, maxTotal, 0.6);
  const pruneOpts = { minV2Reserve: opts.minV2Reserve, probeWei: opts.probeWei };

  // Phase 1: hub graph — all depths including 4-hop bidirectional
  let hubPaths = [];
  if (hubBudget > 0) {
    const hubStart = new Set([...HUB_4_TOKENS].filter((t) => hubGraph.hasToken(t)));
    if (hubStart.size === 0) {
      hubPaths = [];
    } else {
    hubPaths = findArbPaths(hubGraph, hubStart, {
      include2Hop: opts.include2Hop, include3Hop: opts.include3Hop, include4Hop: true,
      maxHops: opts.maxHops,
      maxPathsPerToken: opts.maxPathsPerToken, max4HopPathsPerToken: opts.max4HopPathsPerToken,
      ...pruneOpts,
    });
    if (opts.dedup) hubPaths = deduplicatePaths(hubPaths);
    hubPaths = selectTopPaths(hubPaths, hubBudget);
    }
  }

  // Phase 2: full graph — 3-hop only (4-hop too expensive on large graph)
  const fullBudget = Math.max(0, maxTotal - hubPaths.length);
  let fullPaths = [];
  if (fullBudget > 0) {
    const fullStart = new Set([...POLYGON_HUB_TOKENS].filter((t) => fullGraph.hasToken(t)));
    if (fullStart.size > 0) {
      fullPaths = findArbPaths(fullGraph, fullStart, {
        include2Hop: opts.include2Hop, include3Hop: opts.include3Hop, include4Hop: false,
        maxHops: Math.min(opts.maxHops, 3),
        maxPathsPerToken: opts.maxPathsPerToken,
        ...pruneOpts,
      });
      if (opts.dedup) fullPaths = deduplicatePaths(fullPaths);
      fullPaths = selectTopPaths(fullPaths, fullBudget);
    }
  }

  // Merge, cross-phase dedup, liquidity prune, final sort + cap
  let all = [...hubPaths, ...fullPaths];
  if (opts.dedup) all = deduplicatePaths(all);
  if (opts.minLiquidityWmatic > 0n && opts.getRateWei) {
    all = pruneByLiquidity(all, opts.minLiquidityWmatic, opts.getRateWei);
  }
  return selectTopPaths(all, maxTotal);
}

// ─── Convenience wrappers ────────────────────────────────────

export function enumerateCyclesForToken(graph: any, startToken: any, options: any = {}) {
  return enumerateCycles(graph, { ...options, hubTokensOnly: false, startTokens: new Set([startToken]) });
}

export function cycleSummary(cycles: any) {
  const byHops: Record<string, any> = {}, byProtocol: Record<string, any> = {};
  let crossProtocol = 0;
  for (const c of cycles) {
    byHops[c.hopCount] = (byHops[c.hopCount] || 0) + 1;
    const protos = new Set(c.edges.map((e: any) => e.protocol));
    for (const p of protos) byProtocol[p as string] = (byProtocol[p as string] || 0) + 1;
    if (protos.size > 1) crossProtocol++;
  }
  return { total: cycles.length, byHops, byProtocol, crossProtocol };
}
