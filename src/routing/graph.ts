
/**
 * src/routing/graph.js — Token adjacency graph builder
 *
 * Builds a directed graph where:
 *   - Nodes are token addresses (lowercase)
 *   - Edges are pool-backed swap opportunities
 *   - Each edge carries: protocol, poolAddress, direction (zeroForOne), and a swapFn reference
 *
 * Live stateRefs:
 *   When buildGraph() is called with a stateMap (e.g. the shared stateCache), every edge
 *   receives stateRef = stateMap.get(poolAddress).  The watcher mutates those objects
 *   in-place, so graph edges automatically reflect the latest reserves/sqrtPrice without
 *   any graph rebuild.  simulateHop() prefers edge.stateRef over a Map.get lookup, so
 *   this also eliminates the hot-path hash-map lookup for every hop.
 *
 * The graph supports multi-protocol edges between the same token pair
 * (e.g., WETH-USDC via QuickSwap V2 AND Uniswap V3 at different fee tiers).
 */

import { simulateV3Swap } from "../math/uniswap_v3.ts";

// ─── Protocol sets ────────────────────────────────────────────

const V3_PROTOCOLS = new Set(["UNISWAP_V3", "QUICKSWAP_V3", "SUSHISWAP_V3"]);
const V2_PROTOCOLS = new Set(["QUICKSWAP_V2", "SUSHISWAP_V2", "UNISWAP_V2"]);

function getLiveStateRef(stateMap, poolAddress) {
  const stateRef = stateMap.get(poolAddress);
  return stateRef && typeof stateRef === "object" ? stateRef : null;
}

function getProtocolKind(protocol) {
  if (V2_PROTOCOLS.has(protocol)) return "v2";
  if (V3_PROTOCOLS.has(protocol)) return "v3";
  return "other";
}

function getFeeBps(protocolKind, fee) {
  if (protocolKind === "v2") return 30;
  if (protocolKind === "v3") return Math.round((fee ?? 3000) / 100);
  return 0;
}

function createSwapEdge({
  protocol,
  poolAddress,
  tokenIn,
  tokenOut,
  zeroForOne,
  fee,
  swapFn,
  stateRef,
  metadata,
}) {
  const protocolKind = getProtocolKind(protocol);
  return {
    protocol,
    protocolKind,
    poolAddress,
    tokenIn,
    tokenOut,
    zeroForOne,
    fee,
    feeBps: getFeeBps(protocolKind, fee),
    swapFn,
    stateRef,
    metadata,
  };
}

// ─── Edge definition ──────────────────────────────────────────

/**
 * @typedef {Object} SwapEdge
 * @property {string}        protocol     Protocol key (e.g. "QUICKSWAP_V2", "UNISWAP_V3")
 * @property {string}        poolAddress  Pool contract address (lowercase)
 * @property {string}        tokenIn      Input token address (lowercase)
 * @property {string}        tokenOut     Output token address (lowercase)
 * @property {boolean}       zeroForOne   Swap direction relative to pool's token0/token1
 * @property {"v2"|"v3"|"other"} protocolKind Precomputed protocol family for hot-path checks
 * @property {number|undefined} fee       Fee tier in hundredths of a bip (V3 only)
 * @property {number}         feeBps       Precomputed fee in basis points
 * @property {Function|null} swapFn       Swap simulator: (amountIn, zeroForOne, state, fee) → result
 * @property {Object|null}   stateRef     Live pool state object (same reference as stateCache entry)
 * @property {Object|null}   metadata     Protocol-specific metadata (fee, tickSpacing, etc.)
 */

// ─── Graph class ──────────────────────────────────────────────

export class RoutingGraph {
  constructor() {
    /**
     * Adjacency list: tokenAddress → SwapEdge[]
     * @type {Map<string, SwapEdge[]>}
     */
    this.adjacency = new Map();

    /** Set of all unique token addresses */
    this.tokens = new Set();

    /** Total edge count */
    this.edgeCount = 0;

    /** poolAddress → [edge, edge] — used for O(1) edge state updates */
    this._edgesByPool = new Map();
    /** poolAddress:direction → edge — used for O(1) path hydration */
    this._edgeByPoolDirection = new Map();
  }

  /**
   * Add a directed edge to the graph.
   *
   * @param {SwapEdge} edge
   */
  addEdge(edge) {
    const key = edge.tokenIn;
    if (!this.adjacency.has(key)) {
      this.adjacency.set(key, []);
    }
    this.adjacency.get(key).push(edge);
    this.tokens.add(edge.tokenIn);
    this.tokens.add(edge.tokenOut);
    this.edgeCount++;

    // Index by pool for fast stateRef updates
    if (!this._edgesByPool.has(edge.poolAddress)) {
      this._edgesByPool.set(edge.poolAddress, []);
    }
    this._edgesByPool.get(edge.poolAddress).push(edge);
    this._edgeByPoolDirection.set(
      `${edge.poolAddress}:${edge.zeroForOne ? "1" : "0"}`,
      edge
    );
  }

  /**
   * Get one specific edge by pool address and direction.
   *
   * @param {string} poolAddress
   * @param {boolean} zeroForOne
   * @returns {SwapEdge|undefined}
   */
  getPoolEdge(poolAddress, zeroForOne) {
    return this._edgeByPoolDirection.get(
      `${poolAddress.toLowerCase()}:${zeroForOne ? "1" : "0"}`
    );
  }

  /**
   * Get all outgoing edges from a token.
   *
   * @param {string} tokenAddress  Lowercase token address
   * @returns {SwapEdge[]}
   */
  getEdges(tokenAddress) {
    return this.adjacency.get(tokenAddress) || [];
  }

  /**
   * Get all edges between two specific tokens.
   *
   * @param {string} tokenIn   Input token (lowercase)
   * @param {string} tokenOut  Output token (lowercase)
   * @returns {SwapEdge[]}
   */
  getEdgesBetween(tokenIn, tokenOut) {
    return this.getEdges(tokenIn).filter((e) => e.tokenOut === tokenOut);
  }

  /**
   * Get all neighboring tokens reachable from a token.
   *
   * @param {string} tokenAddress
   * @returns {string[]}
   */
  getNeighbors(tokenAddress) {
    const edges = this.getEdges(tokenAddress);
    return [...new Set(edges.map((e) => e.tokenOut))];
  }

  /**
   * Check if a token exists in the graph.
   *
   * @param {string} tokenAddress
   * @returns {boolean}
   */
  hasToken(tokenAddress) {
    return this.tokens.has(tokenAddress);
  }

  /**
   * Add both directed edges for a single pool into the graph.
   *
   * Use this for incremental additions when new pools are discovered
   * without a full graph rebuild.
   *
   * @param {Object}              pool      Pool record (pool_address, protocol, tokens, metadata)
   * @param {Map<string,Object>}  stateMap  Live stateCache (stateRef assignment)
   */
  addPool(pool, stateMap = new Map()) {
    if (pool.status !== "active") return;

    let tokens;
    try {
      tokens = typeof pool.tokens === "string" ? JSON.parse(pool.tokens) : pool.tokens;
    } catch { return; }
    if (!tokens || tokens.length < 2) return;

    const poolAddress = pool.pool_address.toLowerCase();
    const token0 = tokens[0].toLowerCase();
    const token1 = tokens[1].toLowerCase();

    if (
      token0 === "0x0000000000000000000000000000000000000000" ||
      token1 === "0x0000000000000000000000000000000000000000"
    ) return;

    // Skip if this pool is already in the graph
    if (this._edgesByPool.has(poolAddress)) return;

    let metadata = null;
    try {
      metadata = typeof pool.metadata === "string" ? JSON.parse(pool.metadata) : pool.metadata;
    } catch { metadata = null; }

    const isV3     = V3_PROTOCOLS.has(pool.protocol);
    const fee      = metadata?.fee !== undefined ? Number(metadata.fee) : undefined;
    const stateRef = getLiveStateRef(stateMap, poolAddress);
    if (!stateRef) return;
    const swapFn   = isV3 && stateRef ? simulateV3Swap : null;

    this.addEdge(createSwapEdge({ protocol: pool.protocol, poolAddress, tokenIn: token0, tokenOut: token1, zeroForOne: true, fee, swapFn, stateRef, metadata }));
    this.addEdge(createSwapEdge({ protocol: pool.protocol, poolAddress, tokenIn: token1, tokenOut: token0, zeroForOne: false, fee, swapFn, stateRef, metadata }));
  }

  /**
   * Update the stateRef on all edges for a pool after the stateCache object
   * has been replaced (not mutated).  Normally the watcher mutates in-place,
   * making this unnecessary; call it only if you ever replace stateCache entries.
   *
   * @param {string} poolAddress  Lowercase pool address
   * @param {Object} newState     New state object
   */
  updateEdgeState(poolAddress, newState) {
    const edges = this._edgesByPool.get(poolAddress);
    if (!edges) return;
    for (const edge of edges) {
      edge.stateRef = newState;
    }
  }

  _tokenHasReferences(tokenAddress) {
    const outgoing = this.adjacency.get(tokenAddress);
    if (outgoing && outgoing.length > 0) return true;

    for (const edges of this.adjacency.values()) {
      if (edges.some((edge) => edge.tokenOut === tokenAddress)) return true;
    }

    return false;
  }

  /**
   * Remove both directed edges for a pool from the graph.
   *
   * Use this when a previously-routable pool becomes invalid so path
   * enumeration and token membership stay aligned with the current state set.
   *
   * @param {string} poolAddress  Lowercase pool address
   * @returns {number}            Number of removed directed edges
   */
  removePool(poolAddress) {
    const edges = this._edgesByPool.get(poolAddress);
    if (!edges || edges.length === 0) return 0;

    for (const edge of edges) {
      const nextEdges = this.getEdges(edge.tokenIn).filter(
        (candidate) => candidate !== edge
      );
      if (nextEdges.length > 0) {
        this.adjacency.set(edge.tokenIn, nextEdges);
      } else {
        this.adjacency.delete(edge.tokenIn);
      }
      this.edgeCount--;
    }

    this._edgesByPool.delete(poolAddress);
    this._edgeByPoolDirection.delete(`${poolAddress}:1`);
    this._edgeByPoolDirection.delete(`${poolAddress}:0`);

    for (const edge of edges) {
      if (!this._tokenHasReferences(edge.tokenIn)) {
        this.tokens.delete(edge.tokenIn);
      }
      if (!this._tokenHasReferences(edge.tokenOut)) {
        this.tokens.delete(edge.tokenOut);
      }
    }

    return edges.length;
  }

  /**
   * Get graph statistics.
   */
  stats() {
    const protocolCounts = {};
    for (const [, edges] of this.adjacency) {
      for (const edge of edges) {
        protocolCounts[edge.protocol] =
          (protocolCounts[edge.protocol] || 0) + 1;
      }
    }

    return {
      tokenCount: this.tokens.size,
      edgeCount: this.edgeCount,
      poolCount: this._edgesByPool.size,
      protocolCounts,
    };
  }
}

// ─── Graph builder ────────────────────────────────────────────

/**
 * Build a routing graph from registry pool data.
 *
 * Each pool produces TWO directed edges (one per direction).
 *
 * When stateMap is provided (pass the live stateCache), every edge receives
 * stateRef = stateMap.get(poolAddress).  Because the watcher mutates those
 * objects in-place, the graph stays current without any rebuild.
 * simulateHop() prefers edge.stateRef, eliminating the Map.get hot-path lookup.
 *
 * @param {Array<Object>}      pools     Pool records from RegistryService
 * @param {Map<string,Object>} [stateMap]  Lowercase pool address → pool state
 * @returns {RoutingGraph}
 */
export function buildGraph(pools, stateMap = new Map()) {
  const graph = new RoutingGraph();

  for (const pool of pools) {
    if (pool.status !== "active") continue;

    let tokens;
    try {
      tokens =
        typeof pool.tokens === "string" ? JSON.parse(pool.tokens) : pool.tokens;
    } catch {
      continue;
    }

    if (!tokens || tokens.length < 2) continue;

    const poolAddress = pool.pool_address.toLowerCase();
    const token0 = tokens[0].toLowerCase();
    const token1 = tokens[1].toLowerCase();

    if (
      token0 === "0x0000000000000000000000000000000000000000" ||
      token1 === "0x0000000000000000000000000000000000000000"
    ) {
      continue;
    }

    let metadata = null;
    try {
      metadata =
        typeof pool.metadata === "string"
          ? JSON.parse(pool.metadata)
          : pool.metadata;
    } catch {
      metadata = null;
    }

    const isV3 = V3_PROTOCOLS.has(pool.protocol);
    const fee  = metadata?.fee !== undefined ? Number(metadata.fee) : undefined;

    // All protocols get a live stateRef — not just V3.
    // The watcher mutates these objects in-place on every Sync/Swap event,
    // so the graph never holds stale reserves or prices between arb scans.
    const stateRef = getLiveStateRef(stateMap, poolAddress);

    // V3 pre-attached swapFn: avoids a branch in simulateHop on the hot path
    const swapFn = isV3 && stateRef ? simulateV3Swap : null;

    graph.addEdge(createSwapEdge({
      protocol: pool.protocol,
      poolAddress,
      tokenIn: token0,
      tokenOut: token1,
      zeroForOne: true,
      fee,
      swapFn,
      stateRef,
      metadata,
    }));

    graph.addEdge(createSwapEdge({
      protocol: pool.protocol,
      poolAddress,
      tokenIn: token1,
      tokenOut: token0,
      zeroForOne: false,
      fee,
      swapFn,
      stateRef,
      metadata,
    }));
  }

  return graph;
}

/**
 * Build a graph filtered to only include pools involving specific "hub" tokens.
 *
 * Hub tokens are high-liquidity tokens that most arbitrage paths pass through
 * (e.g., WMATIC, WETH, USDC, USDT, DAI on Polygon).
 *
 * @param {Array<Object>}      pools      All pool records
 * @param {Set<string>}        hubTokens  Set of hub token addresses (lowercase)
 * @param {Map<string,Object>} [stateMap] Lowercase pool address → pool state
 * @returns {RoutingGraph}
 */
export function buildHubGraph(pools, hubTokens, stateMap = new Map()) {
  const graph = new RoutingGraph();

  for (const pool of pools) {
    if (pool.status !== "active") continue;

    let tokens;
    try {
      tokens =
        typeof pool.tokens === "string" ? JSON.parse(pool.tokens) : pool.tokens;
    } catch {
      continue;
    }

    if (!tokens || tokens.length < 2) continue;

    const token0 = tokens[0].toLowerCase();
    const token1 = tokens[1].toLowerCase();

    if (!hubTokens.has(token0) && !hubTokens.has(token1)) continue;

    const poolAddress = pool.pool_address.toLowerCase();

    let metadata = null;
    try {
      metadata =
        typeof pool.metadata === "string"
          ? JSON.parse(pool.metadata)
          : pool.metadata;
    } catch {
      metadata = null;
    }

    const isV3     = V3_PROTOCOLS.has(pool.protocol);
    const fee      = metadata?.fee !== undefined ? Number(metadata.fee) : undefined;
    const stateRef = getLiveStateRef(stateMap, poolAddress);
    const swapFn   = isV3 && stateRef ? simulateV3Swap : null;

    graph.addEdge(createSwapEdge({
      protocol: pool.protocol,
      poolAddress,
      tokenIn: token0,
      tokenOut: token1,
      zeroForOne: true,
      fee,
      swapFn,
      stateRef,
      metadata,
    }));

    graph.addEdge(createSwapEdge({
      protocol: pool.protocol,
      poolAddress,
      tokenIn: token1,
      tokenOut: token0,
      zeroForOne: false,
      fee,
      swapFn,
      stateRef,
      metadata,
    }));
  }

  return graph;
}

// ─── Polygon hub tokens ───────────────────────────────────────

/**
 * Tier-1 bluechip tokens on Polygon used as seeds for full-graph (Phase 2)
 * cycle enumeration and as the both-tokens filter for the startup RPC warmup.
 *
 * These are the highest-liquidity tokens; cycles starting here are the most
 * competitive but also the most reliably profitable.
 */
export const POLYGON_HUB_TOKENS = new Set([
  // ── Tier 1: bluechip base assets ──────────────────────────────
  "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", // WMATIC
  "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", // WETH
  "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", // USDC.e (bridged)
  "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", // USDC (native)
  "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", // USDT
  "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063", // DAI
  "0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6", // WBTC

  // ── Tier 2: liquid staking derivatives ────────────────────────
  // Pools against WMATIC are less contested than pure bluechip pairs.
  "0x3a58a54c066fdc0f2d55fc9c89f0415c92ebf3c4", // stMATIC (Lido)
  "0xfa68fb4628dff1028cfec22b4162fccd0d45efb6", // MaticX  (Stader)

  // ── Tier 2: secondary stablecoins ─────────────────────────────
  "0x45c32fa6df82ead1e2ef74d17b76547eddfaff89", // FRAX
  "0xa3fa99a148fa48d14ed51d610c367c61876997f1", // miMATIC / MAI (Qi Dao)

  // ── Tier 2: DeFi governance / blue-chip DeFi tokens ───────────
  // Actively traded, moderate competition; good 3-hop cycle candidates.
  "0x53e0bca35ec356bd5dddfebbd1fc0fd03fabad39", // LINK
  "0xd6df932a45c0f255f85145f286ea0b292b21c90b", // AAVE
  "0x172370d5cd63279efa6d502dab29171933a610af", // CRV
  "0x9a71012b13ca4d3d0cdc72a177df3ef03b0e76a3", // BAL
  "0xb5c064f955d8e7f38fe0460c556a72987494ee17", // QUICK (new)

  // ── Tier 3: long-tail / gaming / Polygon-native ───────────────
  // Lower competition; peg/price dislocations appear more often.
  "0x385eeac5cb85a38a9a07a70c73e0a3271cfb54a7", // GHST (Aavegotchi)
  "0xbbba073c31bf03b8acf7c28ef0738decf3695683", // SAND (The Sandbox)
  "0xa1c57f48f0deb89f569dfbe6e2b7f46d33606fd4", // MANA (Decentraland)
]);

/**
 * The 5 highest-liquidity "base" tokens on Polygon used by the hub graph
 * (Phase 1 enumeration: 2/3/4-hop BFS on the dense hub sub-graph).
 * Paths between these tokens are prioritised first; both USDC variants are
 * included because active pools exist for each.
 *
 * Intentionally kept small — the hub graph is built from ALL pools that touch
 * any of these tokens, so every extra entry roughly doubles pool count.
 */
export const HUB_4_TOKENS = new Set([
  "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", // WMATIC
  "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", // WETH
  "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", // USDC.e (bridged)
  "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", // USDC (native)
  "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", // USDT
]);

// ─── Topology serialisation ───────────────────────────────────

/**
 * Serialise a graph's topology to a plain transferable object.
 *
 * Strips non-serialisable fields (stateRef, swapFn, metadata) so the result
 * can cross worker-thread boundaries via structured-clone without errors.
 * Workers rebuild a lightweight RoutingGraph from this for path enumeration.
 *
 * @param {RoutingGraph} graph
 * @returns {Object.<string, Array>}  token → lightweight edge array
 */
export function serializeTopology(graph) {
  const adjacency = {};
  for (const [token, edges] of graph.adjacency) {
    adjacency[token] = edges.map(({ protocol, poolAddress, tokenIn, tokenOut, zeroForOne, fee }) => ({
      protocol, poolAddress, tokenIn, tokenOut, zeroForOne, fee: fee ?? null,
    }));
  }
  return adjacency;
}

/**
 * Reconstruct a lightweight RoutingGraph from serialised topology.
 * Edges have no stateRef/swapFn — enumeration use only.
 *
 * @param {Object.<string, Array>} adjacency  Output of serializeTopology
 * @returns {RoutingGraph}
 */
export function deserializeTopology(adjacency) {
  const graph = new RoutingGraph();
  for (const edges of Object.values(adjacency)) {
    for (const e of edges) {
      graph.addEdge({ ...e, fee: e.fee ?? undefined, swapFn: null, stateRef: null, metadata: null });
    }
  }
  return graph;
}
