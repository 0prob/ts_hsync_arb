// @ts-nocheck
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
 *   When minLiquidityWmatic > 0 and getRateWei is provided, V2 pools whose
 *   total TVL (both sides in WMATIC-wei) < threshold are pruned.
 *   $5 000 at $0.70/WMATIC ≈ 7_143n * 10n**18n.
 */

import { findArbPaths, deduplicatePaths } from "./finder.ts";
import { POLYGON_HUB_TOKENS, HUB_4_TOKENS } from "./graph.ts";

// ─── Defaults ────────────────────────────────────────────────

const DEFAULTS = {
  include2Hop:          true,
  include3Hop:          true,
  include4Hop:          false,
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

// ─── Liquidity pruning ────────────────────────────────────────

function v2LiquidityWmatic(edge, getRateWei) {
  const s = edge.stateRef;
  if (!s?.reserve0 || !s?.reserve1) return 0n;
  const t0 = edge.zeroForOne ? edge.tokenIn  : edge.tokenOut;
  const t1 = edge.zeroForOne ? edge.tokenOut : edge.tokenIn;
  return s.reserve0 * getRateWei(t0) + s.reserve1 * getRateWei(t1);
}

function pruneByLiquidity(paths, minWmatic, getRateWei) {
  if (minWmatic <= 0n || !getRateWei) return paths;
  return paths.filter((path) => {
    for (const edge of path.edges) {
      const liq = v2LiquidityWmatic(edge, getRateWei);
      if (liq > 0n && liq < minWmatic) return false;
    }
    return true;
  });
}

// ─── Sort ─────────────────────────────────────────────────────

function sortByLogWeight(paths) {
  return paths.sort((a, b) => {
    const noA = a.logWeight === 0 && a.edges.some((e) => !e.stateRef);
    const noB = b.logWeight === 0 && b.edges.some((e) => !e.stateRef);
    if (noA && !noB) return 1;
    if (!noA && noB) return -1;
    return a.logWeight - b.logWeight;
  });
}

// ─── Single-graph (backward-compatible) ──────────────────────

export function enumerateCycles(graph, options = {}) {
  const opts = { ...DEFAULTS, ...options };

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
    maxPathsPerToken:     opts.maxPathsPerToken,
    max4HopPathsPerToken: opts.max4HopPathsPerToken,
    minV2Reserve:         opts.minV2Reserve,
    probeWei:             opts.probeWei,
  });

  if (opts.dedup) paths = deduplicatePaths(paths);
  if (opts.minLiquidityWmatic > 0n && opts.getRateWei) {
    paths = pruneByLiquidity(paths, opts.minLiquidityWmatic, opts.getRateWei);
  }
  sortByLogWeight(paths);
  if (paths.length > opts.maxTotalPaths) paths = paths.slice(0, opts.maxTotalPaths);
  return paths;
}

// ─── Dual-graph hub-first (preferred) ────────────────────────

export function enumerateCyclesDual(hubGraph, fullGraph, options = {}) {
  const opts      = { ...DEFAULTS, ...options };
  const maxTotal  = opts.maxTotalPaths;
  const hubBudget = opts.hubPathBudget ?? Math.ceil(maxTotal * 0.6);
  const pruneOpts = { minV2Reserve: opts.minV2Reserve, probeWei: opts.probeWei };

  // Phase 1: hub graph — all depths including 4-hop bidirectional
  const hubStart = new Set([...HUB_4_TOKENS].filter((t) => hubGraph.hasToken(t)));
  let hubPaths = findArbPaths(hubGraph, hubStart, {
    include2Hop: opts.include2Hop, include3Hop: opts.include3Hop, include4Hop: true,
    maxPathsPerToken: opts.maxPathsPerToken, max4HopPathsPerToken: opts.max4HopPathsPerToken,
    ...pruneOpts,
  });
  if (opts.dedup) hubPaths = deduplicatePaths(hubPaths);
  sortByLogWeight(hubPaths);
  if (hubPaths.length > hubBudget) hubPaths = hubPaths.slice(0, hubBudget);

  // Phase 2: full graph — 3-hop only (4-hop too expensive on large graph)
  const fullBudget = maxTotal - hubPaths.length;
  const fullStart  = new Set([...POLYGON_HUB_TOKENS].filter((t) => fullGraph.hasToken(t)));
  let fullPaths = findArbPaths(fullGraph, fullStart, {
    include2Hop: opts.include2Hop, include3Hop: opts.include3Hop, include4Hop: false,
    maxPathsPerToken: opts.maxPathsPerToken,
    ...pruneOpts,
  });
  if (opts.dedup) fullPaths = deduplicatePaths(fullPaths);
  sortByLogWeight(fullPaths);
  if (fullPaths.length > fullBudget) fullPaths = fullPaths.slice(0, fullBudget);

  // Merge, cross-phase dedup, liquidity prune, final sort + cap
  let all = [...hubPaths, ...fullPaths];
  if (opts.dedup) all = deduplicatePaths(all);
  if (opts.minLiquidityWmatic > 0n && opts.getRateWei) {
    all = pruneByLiquidity(all, opts.minLiquidityWmatic, opts.getRateWei);
  }
  sortByLogWeight(all);
  if (all.length > maxTotal) all = all.slice(0, maxTotal);
  return all;
}

// ─── Convenience wrappers ────────────────────────────────────

export function enumerateCyclesForToken(graph, startToken, options = {}) {
  return enumerateCycles(graph, { ...options, hubTokensOnly: false, startTokens: new Set([startToken]) });
}

export function cycleSummary(cycles) {
  const byHops = {}, byProtocol = {};
  let crossProtocol = 0;
  for (const c of cycles) {
    byHops[c.hopCount] = (byHops[c.hopCount] || 0) + 1;
    const protos = new Set(c.edges.map((e) => e.protocol));
    for (const p of protos) byProtocol[p] = (byProtocol[p] || 0) + 1;
    if (protos.size > 1) crossProtocol++;
  }
  return { total: cycles.length, byHops, byProtocol, crossProtocol };
}
