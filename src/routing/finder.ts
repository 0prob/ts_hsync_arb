
/**
 * src/routing/finder.js — Arbitrage path finder
 *
 * Discovers candidate arbitrage cycles using:
 *   - 2-hop and 3-hop forward BFS
 *   - 4-hop bidirectional meet-in-middle BFS (O(E²) vs naive O(E⁴))
 *   - Log-space edge weights: log(spotOut/spotIn) − feeCost
 *   - Cumulative fee pre-computation per path (bps)
 *   - Liquidity floor pruning (skip edges with zero/near-zero reserves)
 *
 * Every emitted path is annotated with:
 *   path.logWeight         — sum of edge log-weights; negative = profitable
 *   path.cumulativeFeesBps — total fees along the path in basis points
 *
 * Bellman-Ford note: because each path is a *complete* cycle discovered by BFS,
 * checking logWeight < 0 is equivalent to detecting a negative-weight cycle in
 * Bellman-Ford — no separate graph-wide BF pass is needed.
 */

import { simulateCurveSwap } from "../math/curve.ts";
import { simulateBalancerSwap } from "../math/balancer.ts";
import { simulateDodoSwap } from "../math/dodo.ts";
import { simulateWoofiSwap } from "../math/woofi.ts";
import { toFiniteNumber } from "../util/bigint.ts";
import { routeIdentityFromEdges } from "./route_identity.ts";
import { resolveSwapTokenIndexes } from "./swap_indices.ts";

// ─── Protocol sets ────────────────────────────────────────────

// ─── Log-weight helpers ───────────────────────────────────────

/**
 * Convert a BigInt sqrtPriceX96 to a float safely.
 * sqrtPriceX96 can be up to 160 bits; direct Number() loses precision.
 * Shifting right 64 bits first keeps the high 96 bits — plenty for log().
 */
function sqrtPriceToFloat(sqrtPriceX96: any) {
  return Number(sqrtPriceX96 >> 64n) / (2 ** 32);
}

function probeAmountFromBalance(balance: any) {
  if (!balance || balance <= 0n) return 0n;
  const probe = balance / 1_000_000n;
  return probe > 0n ? probe : 1n;
}

function positiveLog(value: any) {
  if (typeof value === "bigint") {
    if (value <= 0n) return null;
    const digits = value.toString();
    if (digits.length <= 15) return Math.log(Number(value));

    const mantissaDigits = digits.slice(0, 15);
    const mantissa =
      mantissaDigits.length === 1
        ? Number(mantissaDigits)
        : Number(`${mantissaDigits[0]}.${mantissaDigits.slice(1)}`);
    return Math.log(mantissa) + (digits.length - 1) * Math.LN10;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.log(numeric);
}

function quoteBasedLogWeight(edge: any, simulateFn: any) {
  const state = edge.stateRef;
  const balances = state?.balances;
  if (!balances || balances.length < 2) return null;

  const indexes = resolveSwapTokenIndexes(edge, state);
  if (!indexes) return null;
  const inIdx = indexes.tokenInIdx;
  const outIdx = indexes.tokenOutIdx;
  const balanceIn = balances[inIdx];
  const probeAmount = probeAmountFromBalance(balanceIn);
  if (probeAmount <= 0n) return null;

  let amountOut;
  try {
    ({ amountOut } = simulateFn(probeAmount, state, inIdx, outIdx));
  } catch {
    return null;
  }
  if (!amountOut || amountOut <= 0n) return null;

  const amountOutLog = positiveLog(amountOut);
  const probeAmountLog = positiveLog(probeAmount);
  if (amountOutLog == null || probeAmountLog == null) return null;

  return amountOutLog - probeAmountLog;
}

function dodoLogWeight(edge: any) {
  const state = edge.stateRef;
  if (!state) return null;
  const balanceIn = edge.zeroForOne ? state.baseReserve : state.quoteReserve;
  const probeAmount = probeAmountFromBalance(balanceIn);
  if (probeAmount <= 0n) return null;

  let amountOut;
  try {
    ({ amountOut } = simulateDodoSwap(state, probeAmount, edge.zeroForOne));
  } catch {
    return null;
  }
  if (!amountOut || amountOut <= 0n) return null;

  const amountOutLog = positiveLog(amountOut);
  const probeAmountLog = positiveLog(probeAmount);
  if (amountOutLog == null || probeAmountLog == null) return null;

  return amountOutLog - probeAmountLog;
}

/**
 * Compute log(spotOut/spotIn) for a single edge using its live stateRef.
 *
 * V2: log(rOut/rIn) + log(997/1000)
 * V3: log(sqrtP²) − log(1 + fee/1e6)  (direction-adjusted)
 * Other (Balancer/Curve): return 0 (neutral — don't penalise unknowns)
 *
 * Returns null when state is unavailable or reserves are zero.
 *
 * @param {import('./graph.ts').SwapEdge} edge
 * @returns {number|null}
 */
export function edgeSpotLogWeight(edge: any) {
  const state = edge.stateRef;
  if (!state) return null;

  if (edge.protocolKind === "v2") {
    const r0 = state.reserve0;
    const r1 = state.reserve1;
    if (!r0 || !r1 || r0 <= 0n || r1 <= 0n) return null;
    const [rIn, rOut] = edge.zeroForOne ? [r0, r1] : [r1, r0];
    const feeNumerator = toFiniteNumber(edge.fee ?? state.fee, 997);
    const feeDenominator = toFiniteNumber(edge.feeDenominator ?? state.feeDenominator, 1000);
    if (feeDenominator <= 0 || feeNumerator <= 0 || feeNumerator >= feeDenominator) return null;
    const logOut = positiveLog(rOut);
    const logIn = positiveLog(rIn);
    if (logOut == null || logIn == null) return null;
    return logOut - logIn + Math.log(feeNumerator / feeDenominator);
  }

  if (edge.protocolKind === "v3") {
    const sqrtP = state.sqrtPriceX96;
    if (!sqrtP || sqrtP === 0n || !state.initialized) return null;
    const sqrtFloat = sqrtPriceToFloat(sqrtP); // ≈ sqrtPriceX96 / 2^96
    const price01 = sqrtFloat * sqrtFloat;      // token1 per token0
    if (price01 <= 0 || !isFinite(price01)) return null;
    const feeFrac = toFiniteNumber(edge.fee, 3000) / 1e6;
    const logSpot = edge.zeroForOne ? Math.log(price01) : -Math.log(price01);
    return logSpot + Math.log(1 - feeFrac);
  }

  if (edge.protocol.startsWith("CURVE_")) {
    return quoteBasedLogWeight(edge, simulateCurveSwap);
  }

  if (edge.protocol.startsWith("BALANCER_")) {
    return quoteBasedLogWeight(edge, simulateBalancerSwap);
  }

  if (edge.protocol.startsWith("DODO_")) {
    return dodoLogWeight(edge);
  }

  if (edge.protocol === "WOOFI") {
    return quoteBasedLogWeight(edge, simulateWoofiSwap);
  }

  // Unknown protocols remain neutral so they are not over-penalized
  return 0;
}

/**
 * Compute cumulative fees for a path in basis points.
 * V2 = 30 bps; V3 fee is stored in ppm (hundredths of a bip) → divide by 100.
 *
 * @param {ArbPath} path
 * @returns {number}
 */
export function pathCumulativeFeesBps(path: any) {
  let total = 0;
  for (const edge of path.edges) {
    total += edge.feeBps ?? 0;
  }
  return total;
}

/**
 * Annotate a path with logWeight and cumulativeFeesBps.
 *
 * logWeight < 0  → profitable at spot (before gas)
 * logWeight = 0  → insufficient state to evaluate (keep, let simulator decide)
 *
 * Mutates `path` in place and returns it.
 *
 * @param {ArbPath} path
 * @returns {ArbPath}
 */
export function annotatePath(path: any) {
  let logWeight = 0;
  let hasNull = false;

  for (const edge of path.edges) {
    const w = edgeSpotLogWeight(edge);
    if (w === null) {
      hasNull = true;
      break;
    }
    logWeight += w;
  }

  path.logWeight         = hasNull ? 0 : logWeight;
  path.cumulativeFeesBps = pathCumulativeFeesBps(path);
  return path;
}

/**
 * Stable route identity that preserves execution order and direction.
 *
 * Pool-set deduplication is too destructive for cyclic arbitrage because the
 * same pools in a different order can be a different executable route.
 *
 * @param {string} startToken
 * @param {Array<{ poolAddress: string, zeroForOne: boolean }>} edges
 * @returns {string}
 */
export function routeKeyFromEdges(startToken: any, edges: any) {
  return routeIdentityFromEdges(startToken, edges);
}

// ─── Pruning ──────────────────────────────────────────────────

/**
 * Return true if an edge should be pruned due to zero/near-zero liquidity.
 * This is a fast O(1) check using the live stateRef — no extra RPC calls.
 *
 * $5k USD liquidity check: rather than requiring an external price oracle here,
 * we use per-protocol raw thresholds:
 *   V2:  min(reserve0, reserve1) must be > minV2Reserve
 *   V3:  sqrtPriceX96 must be non-zero and liquidity > 0
 *
 * Callers that have access to token prices can apply tighter USD-denominated
 * checks using pruneLowLiquidityPaths() in enumerate_cycles.js.
 *
 * Price-impact check (0.3 %):
 *   For V2, a trade of `probeWei` into the pool impacts price by ≈ probeWei/reserveIn.
 *   We skip the edge if probeWei/reserveIn > 0.003.
 *   For V3/Balancer/Curve we rely on the log-weight being non-negative to filter out
 *   illiquid pools post-simulation.
 *
 * @param {import('./graph.ts').SwapEdge} edge
 * @param {object} opts
 * @param {bigint} [opts.minV2Reserve=0n]   Min raw reserve (per-token) for V2
 * @param {bigint} [opts.probeWei=0n]       Test trade size for 0.3 % impact check
 * @returns {boolean}  true = prune (skip this edge)
 */
function shouldPruneEdge(edge: any, opts: any = {}) {
  const { minV2Reserve = 0n, probeWei = 0n } = opts;
  const state = edge.stateRef;
  if (!state) return false; // no state yet — let simulator reject it

  if (edge.protocolKind === "v2") {
    if (state.reserve0 == null || state.reserve1 == null) return false;
    const r0 = state.reserve0;
    const r1 = state.reserve1;
    if (r0 <= 0n || r1 <= 0n) return true;

    if (minV2Reserve > 0n && (r0 < minV2Reserve || r1 < minV2Reserve)) return true;

    // Price-impact check: probeWei / reserveIn > 0.3 % → prune
    if (probeWei > 0n) {
      const rIn = edge.zeroForOne ? r0 : r1;
      if (rIn > 0n && probeWei * 1000n > rIn * 3n) return true; // impact > 0.3 %
    }

    return false;
  }

  if (edge.protocolKind === "v3") {
    if (state.initialized === undefined || state.sqrtPriceX96 == null || state.liquidity == null) {
      return false;
    }
    if (!state.initialized) return true;
    if (state.sqrtPriceX96 === 0n) return true;
    if (state.liquidity <= 0n) return true;
    return false;
  }

  if (edge.protocol.startsWith("CURVE_")) {
    if (!Array.isArray(state.balances) || state.balances.length < 2) return false;
    if (state.balances.some((b: any) => b <= 0n)) return true;
    if (!state.A || state.A <= 0n) return true;
    return false;
  }

  if (edge.protocol.startsWith("BALANCER_")) {
    if (!Array.isArray(state.balances) || state.balances.length < 2) return false;
    if (state.balances.some((b: any) => b <= 0n)) return true;
    if (state.isStable === true || state.amp != null) {
      if (state.amp == null || state.amp <= 0n) return true;
      if (!Array.isArray(state.scalingFactors) || state.scalingFactors.length !== state.balances.length) return true;
      if (state.scalingFactors.some((factor: any) => factor <= 0n)) return true;
      return false;
    }
    if (!Array.isArray(state.weights) || state.weights.length < 2) return false;
    if (state.weights.some((weight: any) => weight <= 0n)) return true;
    return false;
  }

  if (edge.protocol.startsWith("DODO_")) {
    if (state.baseReserve == null || state.quoteReserve == null) return false;
    if (state.baseReserve <= 0n || state.quoteReserve <= 0n) return true;
    if (state.baseTarget == null || state.quoteTarget == null) return false;
    if (state.baseTarget <= 0n || state.quoteTarget <= 0n) return true;
    if (state.i == null || state.i <= 0n) return true;
    return false;
  }

  if (edge.protocol === "WOOFI") {
    if (!Array.isArray(state.balances) || state.balances.length < 2) return false;
    if (state.balances.some((b: any) => b <= 0n)) return true;
    if (!state.baseTokenStates || typeof state.baseTokenStates !== "object") return false;
    const inState = state.baseTokenStates[String(edge.tokenIn).toLowerCase()];
    const outState = state.baseTokenStates[String(edge.tokenOut).toLowerCase()];
    if (edge.tokenIn !== state.quoteToken && (!inState || inState.price <= 0n || inState.feasible === false)) return true;
    if (edge.tokenOut !== state.quoteToken && (!outState || outState.price <= 0n || outState.feasible === false)) return true;
    return false;
  }

  return false; // Balancer/Curve — let through, simulator handles
}

function normalizePathLimit(value: any, fallback: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return Math.floor(numeric);
}

function normalizeStartTokens(startTokens: any) {
  const normalize = (token: unknown) => {
    if (typeof token !== "string") return null;
    const trimmed = token.trim().toLowerCase();
    return trimmed.length > 0 ? trimmed : null;
  };
  if (typeof startTokens === "string") {
    const token = normalize(startTokens);
    return token ? [token] : [];
  }
  if (!startTokens || typeof startTokens[Symbol.iterator] !== "function") return [];
  return [...new Set([...startTokens].map(normalize).filter((token): token is string => token != null))];
}

function compareByPathLogWeight(a: any, b: any) {
  return toFiniteNumber(a?.logWeight) - toFiniteNumber(b?.logWeight);
}

function selectTopPathsByLogWeight(paths: any[], limit: number) {
  if (!Number.isFinite(limit) || limit <= 0) return [];
  if (paths.length <= limit) return paths;
  return [...paths].sort(compareByPathLogWeight).slice(0, Math.floor(limit));
}

// ─── 2-hop paths ──────────────────────────────────────────────

/**
 * @typedef {Object} ArbPath
 * @property {string}   startToken
 * @property {import('./graph.ts').SwapEdge[]} edges
 * @property {number}   hopCount
 * @property {number}   logWeight        — sum of edge log-weights (annotated)
 * @property {number}   cumulativeFeesBps — total fees in bps (annotated)
 */

/**
 * Find all 2-hop arbitrage paths starting from a token.
 * A → B → A using two different pools.
 *
 * @param {import('./graph.ts').RoutingGraph} graph
 * @param {string} startToken
 * @param {object} [opts]
 * @param {bigint} [opts.minV2Reserve]
 * @param {bigint} [opts.probeWei]
 * @returns {ArbPath[]}
 */
export function find2HopPaths(graph: any, startToken: any, opts: any = {}) {
  const maxPaths = normalizePathLimit(opts.maxPaths, 10_000);
  const paths = [];
  const edgesOut = graph.getEdges(startToken);

  // Group forward edges by destination
  const byDest = new Map();
  for (const edge of edgesOut) {
    if (shouldPruneEdge(edge, opts)) continue;
    const key = edge.tokenOut;
    if (!byDest.has(key)) byDest.set(key, []);
    byDest.get(key).push(edge);
  }

  for (const [tokenB, fwdEdges] of byDest) {
    const retEdges = graph.getEdgesBetween(tokenB, startToken);
    for (const fwd of fwdEdges) {
      for (const ret of retEdges) {
        if (ret.poolAddress === fwd.poolAddress) continue;
        if (shouldPruneEdge(ret, opts)) continue;
        annotatePath(
          paths[paths.push({ startToken, edges: [fwd, ret], hopCount: 2 }) - 1]
        );
        if (paths.length >= maxPaths) return paths;
      }
    }
  }

  return paths;
}

// ─── 3-hop paths ──────────────────────────────────────────────

/**
 * Find all 3-hop triangular paths: A → B → C → A.
 *
 * @param {import('./graph.ts').RoutingGraph} graph
 * @param {string} startToken
 * @param {object} [opts]
 * @param {number} [opts.maxPaths=10000]
 * @param {bigint} [opts.minV2Reserve]
 * @param {bigint} [opts.probeWei]
 * @returns {ArbPath[]}
 */
export function find3HopPaths(graph: any, startToken: any, opts: any = {}) {
  const maxPaths = normalizePathLimit(opts.maxPaths, 10_000);
  const paths = [];

  for (const e1 of graph.getEdges(startToken)) {
    if (shouldPruneEdge(e1, opts)) continue;
    const tokenB = e1.tokenOut;
    if (tokenB === startToken) continue;

    for (const e2 of graph.getEdges(tokenB)) {
      if (shouldPruneEdge(e2, opts)) continue;
      const tokenC = e2.tokenOut;
      if (tokenC === startToken || tokenC === tokenB) continue;
      if (e2.poolAddress === e1.poolAddress) continue;

      for (const e3 of graph.getEdgesBetween(tokenC, startToken)) {
        if (shouldPruneEdge(e3, opts)) continue;
        const p1 = e1.poolAddress, p2 = e2.poolAddress, p3 = e3.poolAddress;
        if (p3 === p1 || p3 === p2) continue;

        annotatePath(
          paths[paths.push({ startToken, edges: [e1, e2, e3], hopCount: 3 }) - 1]
        );

        if (paths.length >= maxPaths) return paths;
      }
    }
  }

  return paths;
}

// ─── 4-hop bidirectional ──────────────────────────────────────

/**
 * Find all 4-hop cycles using bidirectional meet-in-the-middle BFS.
 *
 * Naive approach is O(E⁴). This is O(E²) for each half + O(|fwd| × |bwd|) join,
 * effectively bounded by `maxPaths` in practice.
 *
 * A → B → C → D → A
 *  forward half:  A → B → C  (stored keyed by mid-token C)
 *  backward half: C → D → A  (stored keyed by meeting token C)
 *  join: combine pairs where all 4 pools are distinct.
 *
 * @param {import('./graph.ts').RoutingGraph} graph
 * @param {string} startToken
 * @param {object} [opts]
 * @param {number} [opts.maxPaths=2000]
 * @param {bigint} [opts.minV2Reserve]
 * @param {bigint} [opts.probeWei]
 * @returns {ArbPath[]}
 */
export function find4HopPathsBidirectional(graph: any, startToken: any, opts: any = {}) {
  const maxPaths = normalizePathLimit(opts.maxPaths, 2_000);
  const paths: any[] = [];

  // ── Forward half: A → B → C ──────────────────────────────
  // fwd: midToken(C) → [ [e1, e2], ... ]
  const fwd = new Map();

  for (const e1 of graph.getEdges(startToken)) {
    if (shouldPruneEdge(e1, opts)) continue;
    const tokenB = e1.tokenOut;
    if (tokenB === startToken) continue;

    for (const e2 of graph.getEdges(tokenB)) {
      if (shouldPruneEdge(e2, opts)) continue;
      const tokenC = e2.tokenOut;
      if (tokenC === startToken || tokenC === tokenB) continue;
      if (e2.poolAddress === e1.poolAddress) continue;

      if (!fwd.has(tokenC)) fwd.set(tokenC, []);
      fwd.get(tokenC).push([e1, e2]);
    }
  }

  if (fwd.size === 0) return paths;

  // ── Backward half: C → D → A (only from mid-tokens found above) ──
  // bwd: midToken(C) → [ [e3, e4], ... ]
  const bwd = new Map();

  for (const [tokenC] of fwd) {
    for (const e3 of graph.getEdges(tokenC)) {
      if (shouldPruneEdge(e3, opts)) continue;
      const tokenD = e3.tokenOut;
      if (tokenD === startToken || tokenD === tokenC) continue;

      for (const e4 of graph.getEdgesBetween(tokenD, startToken)) {
        if (shouldPruneEdge(e4, opts)) continue;
        if (e4.poolAddress === e3.poolAddress) continue;

        if (!bwd.has(tokenC)) bwd.set(tokenC, []);
        bwd.get(tokenC).push([e3, e4]);
      }
    }
  }

  // ── Join at mid-token C ──────────────────────────────────
  for (const [tokenC, fwdPairs] of fwd) {
    const bwdPairs = bwd.get(tokenC);
    if (!bwdPairs) continue;

    for (const [e1, e2] of fwdPairs) {
      const p1 = e1.poolAddress, p2 = e2.poolAddress;
      for (const [e3, e4] of bwdPairs) {
        const p3 = e3.poolAddress, p4 = e4.poolAddress;
        // All 4 pools must be unique (bit-twiddling-free: 6 comparisons)
        if (p1 === p2 || p1 === p3 || p1 === p4 ||
                         p2 === p3 || p2 === p4 ||
                                      p3 === p4) continue;

        annotatePath(
          paths[paths.push({ startToken, edges: [e1, e2, e3, e4], hopCount: 4 }) - 1]
        );

        if (paths.length >= maxPaths) return paths;
      }
    }
  }

  return paths;
}

// Backward-compat alias (old name → new bidirectional impl)
export const find4HopPaths = find4HopPathsBidirectional;

function findNHopPaths(graph: any, startToken: any, exactHops: number, opts: any = {}) {
  const maxPaths = normalizePathLimit(opts.maxPaths, 2_000);
  if (!Number.isFinite(exactHops) || exactHops < 2) return [];

  const paths: any[] = [];
  const edges: any[] = [];
  const usedPools = new Set<string>();
  const visitedTokens = new Set<string>();

  function dfs(currentToken: string, depth: number) {
    if (paths.length >= maxPaths) return;

    for (const edge of graph.getEdges(currentToken)) {
      if (shouldPruneEdge(edge, opts)) continue;
      if (usedPools.has(edge.poolAddress)) continue;

      const nextToken = edge.tokenOut;
      const isFinalHop = depth + 1 === exactHops;

      if (isFinalHop) {
        if (nextToken !== startToken) continue;
      } else {
        if (nextToken === startToken) continue;
        if (visitedTokens.has(nextToken)) continue;
      }

      edges.push(edge);
      usedPools.add(edge.poolAddress);

      if (isFinalHop) {
        annotatePath(
          paths[paths.push({ startToken, edges: [...edges], hopCount: exactHops }) - 1]
        );
      } else {
        visitedTokens.add(nextToken);
        dfs(nextToken, depth + 1);
        visitedTokens.delete(nextToken);
      }

      usedPools.delete(edge.poolAddress);
      edges.pop();

      if (paths.length >= maxPaths) return;
    }
  }

  dfs(startToken, 0);
  return paths;
}

// ─── Aggregated search ────────────────────────────────────────

/**
 * Find all arbitrage paths from a set of start tokens.
 *
 * All emitted paths are annotated with logWeight and cumulativeFeesBps.
 * Callers should sort by logWeight ascending (most negative = best opportunity).
 *
 * @param {import('./graph.ts').RoutingGraph} graph
 * @param {Set<string>|string[]}  startTokens
 * @param {object} [opts]
 * @param {boolean} [opts.include2Hop=true]
 * @param {boolean} [opts.include3Hop=true]
 * @param {boolean} [opts.include4Hop=false]
 * @param {number}  [opts.maxPathsPerToken=5000]    cap for 2+3-hop per token
 * @param {number}  [opts.max4HopPathsPerToken=2000] cap for 4-hop per token
 * @param {bigint}  [opts.minV2Reserve=0n]   V2 per-token reserve floor
 * @param {bigint}  [opts.probeWei=0n]       probe trade size for 0.3 % impact
 * @returns {ArbPath[]}
 */
export function findArbPaths(graph: any, startTokens: any, opts: any = {}) {
  const {
    include2Hop = true,
    include3Hop = true,
    include4Hop = false,
    maxHops = 4,
    maxPathsPerToken     = 5_000,
    max4HopPathsPerToken = 2_000,
    minV2Reserve = 0n,
    probeWei     = 0n,
  } = opts;

  const pruneOpts = { minV2Reserve, probeWei };
  const allPaths  = [];
  const tokenList = normalizeStartTokens(startTokens);

  for (const token of tokenList) {
    if (!graph.hasToken(token)) continue;

    const shortPaths = [];
    if (include2Hop) {
      shortPaths.push(...find2HopPaths(graph, token, {
        ...pruneOpts,
        maxPaths: maxPathsPerToken,
      }));
    }

    if (include3Hop) {
      shortPaths.push(...find3HopPaths(graph, token, {
        ...pruneOpts,
        maxPaths: maxPathsPerToken,
      }));
    }

    allPaths.push(...selectTopPathsByLogWeight(shortPaths, maxPathsPerToken));

    if (include4Hop) {
      const complexPaths = find4HopPathsBidirectional(graph, token, {
        ...pruneOpts,
        maxPaths: max4HopPathsPerToken,
      });
      allPaths.push(...complexPaths);

      let remainingComplexBudget = Math.max(0, max4HopPathsPerToken - complexPaths.length);
      const boundedMaxHops = Math.max(4, Math.floor(maxHops));
      for (let hopCount = 5; hopCount <= boundedMaxHops && remainingComplexBudget > 0; hopCount++) {
        const nhopPaths = findNHopPaths(graph, token, hopCount, {
          ...pruneOpts,
          maxPaths: remainingComplexBudget,
        });
        allPaths.push(...nhopPaths);
        remainingComplexBudget -= nhopPaths.length;
      }
    }
  }

  return allPaths;
}

// ─── Deduplication ───────────────────────────────────────────

/**
 * Remove paths that traverse the same set of pools (regardless of order).
 *
 * @param {ArbPath[]} paths
 * @returns {ArbPath[]}
 */
export function deduplicatePaths(paths: any) {
  const seen   = new Set();
  const unique = [];

  for (const path of paths) {
    const key = routeKeyFromEdges(path.startToken, path.edges);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(path);
    }
  }

  return unique;
}
