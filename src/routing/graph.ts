
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
import { getWoofiEdgeFeeBps, getWoofiFeeRate } from "../math/woofi.ts";
import { toFiniteNumber } from "../util/bigint.ts";
import { getPoolMetadata, getPoolTokens, hasZeroAddressToken, normalizeEvmAddress } from "../util/pool_record.ts";
import { PROTOCOLS } from "../protocols/index.ts";
import { EXTRA_HUB_4_TOKENS, EXTRA_POLYGON_HUB_TOKENS } from "../config/index.ts";
import { DODO_PROTOCOLS, normalizeProtocolKey, V2_PROTOCOLS, V3_PROTOCOLS, WOOFI_PROTOCOLS } from "../protocols/classification.ts";

// ─── Protocol sets ────────────────────────────────────────────

function protocolSupportsRouting(protocol: string) {
  const definition = (PROTOCOLS as Record<string, { capabilities?: { routing?: boolean } }>)[normalizeProtocolKey(protocol)];
  return definition?.capabilities?.routing !== false;
}

function getLiveStateRef(stateMap: any, poolAddress: any) {
  const normalizedPoolAddress = normalizeEvmAddress(poolAddress);
  if (!normalizedPoolAddress || typeof stateMap?.get !== "function") return null;
  const stateRef = stateMap.get(normalizedPoolAddress) ?? stateMap.get(poolAddress);
  return stateRef && typeof stateRef === "object" ? stateRef : null;
}

function getProtocolKind(protocol: any) {
  const protocolKey = normalizeProtocolKey(protocol);
  if (V2_PROTOCOLS.has(protocolKey)) return "v2";
  if (V3_PROTOCOLS.has(protocolKey)) return "v3";
  if (DODO_PROTOCOLS.has(protocolKey)) return "dodo";
  if (WOOFI_PROTOCOLS.has(protocolKey)) return "woofi";
  return "other";
}

function getFeeBps(protocolKind: any, fee: any, feeDenominator?: any) {
  if (protocolKind === "v2") {
    const numerator = toFiniteNumber(fee, 997);
    const denominator = toFiniteNumber(feeDenominator, 1000);
    if (denominator <= 0 || numerator <= 0 || numerator >= denominator) return 0;
    return Math.max(0, Math.round(((denominator - numerator) / denominator) * 10_000));
  }
  if (protocolKind === "v3") return Math.round(toFiniteNumber(fee, 3000) / 100);
  if (protocolKind === "dodo") {
    return Math.max(0, Math.round(toFiniteNumber(fee, 0) / 1e18 * 10_000));
  }
  if (protocolKind === "woofi") {
    return Math.max(0, Math.round(toFiniteNumber(fee, 0) / 10));
  }
  return 0;
}

function createSwapEdge({
  protocol,
  poolAddress,
  tokenIn,
  tokenOut,
  tokenInIdx,
  tokenOutIdx,
  zeroForOne,
  fee,
  swapFeeBps,
  feeDenominator,
  swapFn,
  stateRef,
  metadata,
}: {
  protocol: any; poolAddress: any; tokenIn: any; tokenOut: any;
  tokenInIdx?: any; tokenOutIdx?: any; zeroForOne: any; fee: any; swapFeeBps?: any; feeDenominator?: any; swapFn: any; stateRef: any; metadata: any;
}) {
  const protocolKind = getProtocolKind(protocol);
  return {
    protocol,
    protocolKind,
    poolAddress,
    tokenIn,
    tokenOut,
    tokenInIdx,
    tokenOutIdx,
    zeroForOne,
    fee,
    swapFeeBps,
    feeDenominator,
    feeBps: getFeeBps(protocolKind, fee, feeDenominator),
    swapFn,
    stateRef,
    metadata,
  };
}

function normalizeTokenListForRouting(tokens: unknown) {
  if (!Array.isArray(tokens)) return [];
  return [
    ...new Set(
      tokens
        .map((token) => normalizeEvmAddress(token))
        .filter((token): token is string => token != null),
    ),
  ];
}

function getRoutablePoolContext(pool: any, stateMap: any) {
  if (pool.status !== "active") return null;
  const protocol = normalizeProtocolKey(pool.protocol);
  if (!protocolSupportsRouting(protocol)) return null;

  const poolAddress = normalizeEvmAddress(pool.pool_address);
  if (!poolAddress) return null;
  const stateRef = getLiveStateRef(stateMap, poolAddress);
  const stateTokens = normalizeTokenListForRouting(stateRef?.tokens);
  const tokens = stateTokens.length >= 2 ? stateTokens : getPoolTokens(pool);
  if (!tokens || tokens.length < 2 || hasZeroAddressToken(tokens)) return null;

  const metadata = getPoolMetadata(pool);
  const isV3 = V3_PROTOCOLS.has(protocol);
  const isDodo = DODO_PROTOCOLS.has(protocol);
  const fee = isV3
    ? stateRef?.fee != null
      ? Number(stateRef.fee)
      : metadata?.fee !== undefined
        ? Number(metadata.fee)
        : undefined
    : isDodo
      ? stateRef?.fee != null
        ? Number(stateRef.fee)
        : undefined
    : stateRef?.fee != null
      ? Number(stateRef.fee)
      : metadata?.feeNumerator !== undefined
        ? Number(metadata.feeNumerator)
        : undefined;
  const swapFeeBps = isV3 && protocol === "KYBERSWAP_ELASTIC"
    ? stateRef?.swapFeeBps != null
      ? Number(stateRef.swapFeeBps)
      : metadata?.swapFeeBps != null
        ? Number(metadata.swapFeeBps)
        : undefined
    : undefined;
  const feeDenominator = !isV3
    ? stateRef?.feeDenominator != null
      ? Number(stateRef.feeDenominator)
      : metadata?.feeDenominator !== undefined
        ? Number(metadata.feeDenominator)
        : metadata?.fee_denominator !== undefined
          ? Number(metadata.fee_denominator)
          : undefined
    : undefined;

  return {
    tokens: tokens.map((token: string) => token.toLowerCase()),
    protocol,
    poolAddress,
    metadata,
    fee,
    swapFeeBps,
    feeDenominator,
    stateRef,
    swapFn: isV3 && stateRef ? simulateV3Swap : null,
  };
}

function addPoolEdges(
  graph: RoutingGraph,
  pool: any,
  stateMap: any,
  shouldInclude: (context: NonNullable<ReturnType<typeof getRoutablePoolContext>>) => boolean = () => true
) {
  const context = getRoutablePoolContext(pool, stateMap);
  if (!context || !shouldInclude(context)) return false;

  const { tokens, protocol, poolAddress, metadata, fee, swapFeeBps, feeDenominator, stateRef, swapFn } = context;
  const isWoofi = WOOFI_PROTOCOLS.has(protocol);
  for (let tokenInIdx = 0; tokenInIdx < tokens.length; tokenInIdx++) {
    for (let tokenOutIdx = 0; tokenOutIdx < tokens.length; tokenOutIdx++) {
      if (tokenInIdx === tokenOutIdx) continue;
      const edgeFee = isWoofi && stateRef
        ? getWoofiFeeRate(stateRef, tokens[tokenInIdx], tokens[tokenOutIdx])
        : fee;
      graph.addEdge(createSwapEdge({
        protocol,
        poolAddress,
        tokenIn: tokens[tokenInIdx],
        tokenOut: tokens[tokenOutIdx],
        tokenInIdx,
        tokenOutIdx,
        zeroForOne: tokenInIdx < tokenOutIdx,
        fee: edgeFee,
        swapFeeBps,
        feeDenominator,
        swapFn,
        stateRef,
        metadata: {
          ...metadata,
          tokenInIdx,
          tokenOutIdx,
          ...(isWoofi && stateRef
            ? { feeBps: getWoofiEdgeFeeBps(stateRef, tokens[tokenInIdx], tokens[tokenOutIdx]) }
            : {}),
        },
      }));
    }
  }

  return true;
}

function buildPoolEdgeSnapshot(
  pool: any,
  stateMap: any,
  shouldInclude: (context: NonNullable<ReturnType<typeof getRoutablePoolContext>>) => boolean = () => true
) {
  const poolAddress = normalizeEvmAddress(pool?.pool_address);
  if (!poolAddress) return { poolAddress: null, edges: [] as any[] };

  const graph = new RoutingGraph();
  addPoolEdges(graph, pool, stateMap, shouldInclude);
  return {
    poolAddress,
    edges: graph._edgesByPool.get(poolAddress) ?? [],
  };
}

function edgeTopologySignature(edge: any) {
  return [
    edge.protocol,
    edge.tokenIn,
    edge.tokenOut,
    edge.tokenInIdx ?? null,
    edge.tokenOutIdx ?? null,
    edge.zeroForOne,
    edge.fee ?? null,
    edge.swapFeeBps ?? null,
    edge.feeDenominator ?? null,
    edge.feeBps ?? null,
  ].join("|");
}

function samePoolTopology(left: any[], right: any[]) {
  if (left.length !== right.length) return false;
  const leftKeys = left.map(edgeTopologySignature).sort();
  const rightKeys = right.map(edgeTopologySignature).sort();
  return leftKeys.every((key, index) => key === rightKeys[index]);
}

function serializeTopologyStateRef(state: any) {
  if (!state || typeof state !== "object") return null;
  const protocol = normalizeProtocolKey(state.protocol);
  const common = {
    poolId: state.poolId,
    protocol,
    tokens: Array.isArray(state.tokens) ? state.tokens : undefined,
  };

  if (V2_PROTOCOLS.has(protocol)) {
    return {
      ...common,
      reserve0: state.reserve0,
      reserve1: state.reserve1,
      fee: state.fee,
      feeDenominator: state.feeDenominator,
    };
  }

  if (V3_PROTOCOLS.has(protocol)) {
    return {
      ...common,
      initialized: state.initialized,
      sqrtPriceX96: state.sqrtPriceX96,
      liquidity: state.liquidity,
    };
  }

  if (protocol.startsWith("CURVE_")) {
    return {
      ...common,
      balances: state.balances,
      rates: state.rates,
      A: state.A,
      fee: state.fee,
    };
  }

  if (protocol.startsWith("BALANCER_")) {
    return {
      ...common,
      balances: state.balances,
      weights: state.weights,
      swapFee: state.swapFee,
      isStable: state.isStable,
      amp: state.amp,
      ampPrecision: state.ampPrecision,
      scalingFactors: state.scalingFactors,
    };
  }

  if (DODO_PROTOCOLS.has(protocol)) {
    return {
      ...common,
      baseToken: state.baseToken,
      quoteToken: state.quoteToken,
      baseReserve: state.baseReserve,
      quoteReserve: state.quoteReserve,
      baseTarget: state.baseTarget,
      quoteTarget: state.quoteTarget,
      i: state.i,
      k: state.k,
      rState: state.rState,
      lpFeeRate: state.lpFeeRate,
      mtFeeRate: state.mtFeeRate,
    };
  }

  if (WOOFI_PROTOCOLS.has(protocol)) {
    return {
      ...common,
      quoteToken: state.quoteToken,
      quoteReserve: state.quoteReserve,
      baseTokenStates: state.baseTokenStates,
      balances: state.balances,
    };
  }

  return common;
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
  adjacency: Map<string, any[]>;
  tokens: Set<string>;
  edgeCount: number;
  _edgesByPool: Map<string, any[]>;
  _edgeByPoolRoute: Map<string, any>;

  constructor() {
    this.adjacency = new Map();
    this.tokens = new Set();
    this.edgeCount = 0;
    this._edgesByPool = new Map();
    this._edgeByPoolRoute = new Map();
  }

  /**
   * Add a directed edge to the graph.
   *
   * @param {SwapEdge} edge
   */
  addEdge(edge: any) {
    const key = edge.tokenIn;
    if (!this.adjacency.has(key)) {
      this.adjacency.set(key, []);
    }
    this.adjacency.get(key)!.push(edge);
    this.tokens.add(edge.tokenIn);
    this.tokens.add(edge.tokenOut);
    this.edgeCount++;

    // Index by pool for fast stateRef updates
    if (!this._edgesByPool.has(edge.poolAddress)) {
      this._edgesByPool.set(edge.poolAddress, []);
    }
    this._edgesByPool.get(edge.poolAddress)!.push(edge);
    this._edgeByPoolRoute.set(
      `${edge.poolAddress}:${edge.tokenIn.toLowerCase()}:${edge.tokenOut.toLowerCase()}`,
      edge
    );
  }

  /**
   * Get one specific edge by pool address and direction.
   *
   * @param {string} poolAddress
   * @param {string} tokenIn
   * @param {string} tokenOut
   * @returns {SwapEdge|undefined}
   */
  getPoolEdge(poolAddress: any, tokenIn: any, tokenOut: any) {
    return this._edgeByPoolRoute.get(
      `${poolAddress.toLowerCase()}:${tokenIn.toLowerCase()}:${tokenOut.toLowerCase()}`
    );
  }

  /**
   * Get all outgoing edges from a token.
   *
   * @param {string} tokenAddress  Lowercase token address
   * @returns {SwapEdge[]}
   */
  getEdges(tokenAddress: any) {
    return this.adjacency.get(tokenAddress) || [];
  }

  /**
   * Get all edges between two specific tokens.
   *
   * @param {string} tokenIn   Input token (lowercase)
   * @param {string} tokenOut  Output token (lowercase)
   * @returns {SwapEdge[]}
   */
  getEdgesBetween(tokenIn: any, tokenOut: any) {
    return this.getEdges(tokenIn).filter((e) => e.tokenOut === tokenOut);
  }

  /**
   * Get all neighboring tokens reachable from a token.
   *
   * @param {string} tokenAddress
   * @returns {string[]}
   */
  getNeighbors(tokenAddress: any) {
    const edges = this.getEdges(tokenAddress);
    return [...new Set(edges.map((e) => e.tokenOut))];
  }

  /**
   * Check if a token exists in the graph.
   *
   * @param {string} tokenAddress
   * @returns {boolean}
   */
  hasToken(tokenAddress: any) {
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
  addPool(pool: any, stateMap = new Map()) {
    const poolAddress = normalizeEvmAddress(pool.pool_address);
    if (!poolAddress) return;
    // Skip if this pool is already in the graph
    if (this._edgesByPool.has(poolAddress)) return;
    addPoolEdges(this, pool, stateMap, (context) => !!context?.stateRef);
  }

  upsertPool(pool: any, stateMap = new Map()) {
    const { poolAddress, edges } = buildPoolEdgeSnapshot(
      pool,
      stateMap,
      (context) => !!context?.stateRef,
    );
    if (!poolAddress) return "skipped";

    const currentEdges = this._edgesByPool.get(poolAddress) ?? [];
    if (edges.length === 0) {
      if (currentEdges.length > 0) {
        this.removePool(poolAddress);
        return "removed";
      }
      return "skipped";
    }

    if (currentEdges.length === 0) {
      for (const edge of edges) this.addEdge(edge);
      return "added";
    }

    if (samePoolTopology(currentEdges, edges)) {
      for (const edge of edges) {
        const current = this.getPoolEdge(edge.poolAddress, edge.tokenIn, edge.tokenOut);
        if (!current) continue;
        current.stateRef = edge.stateRef;
        current.metadata = edge.metadata;
      }
      return "unchanged";
    }

    this.removePool(poolAddress);
    for (const edge of edges) this.addEdge(edge);
    return "updated";
  }

  /**
   * Update the stateRef on all edges for a pool after the stateCache object
   * has been replaced (not mutated).  Normally the watcher mutates in-place,
   * making this unnecessary; call it only if you ever replace stateCache entries.
   *
   * @param {string} poolAddress  Lowercase pool address
   * @param {Object} newState     New state object
   */
  updateEdgeState(poolAddress: any, newState: any) {
    const normalizedPoolAddress = normalizeEvmAddress(poolAddress);
    if (!normalizedPoolAddress) return;
    const edges = this._edgesByPool.get(normalizedPoolAddress);
    if (!edges) return;
    for (const edge of edges) {
      edge.stateRef = newState;
    }
  }

  _tokenHasReferences(tokenAddress: any) {
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
  removePool(poolAddress: any) {
    poolAddress = normalizeEvmAddress(poolAddress);
    if (!poolAddress) return 0;
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
    for (const edge of edges) {
      this._edgeByPoolRoute.delete(
        `${poolAddress}:${edge.tokenIn.toLowerCase()}:${edge.tokenOut.toLowerCase()}`
      );
    }

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
    const protocolCounts: Record<string, number> = {};
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
export function buildGraph(pools: any, stateMap = new Map()) {
  const graph = new RoutingGraph();

  for (const pool of pools) {
    addPoolEdges(graph, pool, stateMap);
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
export function buildHubGraph(pools: any, hubTokens: any, stateMap = new Map()) {
  const graph = new RoutingGraph();

  for (const pool of pools) {
    addPoolEdges(graph, pool, stateMap, (context) =>
      context.tokens.some((token: string) => hubTokens.has(token))
    );
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
const DEFAULT_POLYGON_HUB_TOKENS = [
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
];

export const POLYGON_HUB_TOKENS = new Set([
  ...DEFAULT_POLYGON_HUB_TOKENS,
  ...EXTRA_POLYGON_HUB_TOKENS,
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
const DEFAULT_HUB_4_TOKENS = [
  "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", // WMATIC
  "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", // WETH
  "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", // USDC.e (bridged)
  "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", // USDC (native)
  "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", // USDT
];

export const HUB_4_TOKENS = new Set([
  ...DEFAULT_HUB_4_TOKENS,
  ...EXTRA_HUB_4_TOKENS,
]);

// ─── Topology serialisation ───────────────────────────────────

/**
 * Serialise a graph's topology to a plain transferable object.
 *
 * Strips non-serialisable fields (swapFn, metadata) but keeps a compact
 * structured-clone-safe stateRef so workers can still prune and rank paths
 * before applying per-token caps.
 *
 * @param {RoutingGraph} graph
 * @returns {Object.<string, Array>}  token → lightweight edge array
 */
export function serializeTopology(graph: any) {
  const adjacency: Record<string, any[]> = {};
  for (const [token, edges] of graph.adjacency) {
    adjacency[token] = edges.map(({ protocol, protocolKind, poolAddress, tokenIn, tokenOut, tokenInIdx, tokenOutIdx, zeroForOne, fee, swapFeeBps, feeDenominator, feeBps, stateRef }: any) => ({
      protocol, protocolKind, poolAddress, tokenIn, tokenOut, tokenInIdx, tokenOutIdx, zeroForOne, fee: fee ?? null, swapFeeBps: swapFeeBps ?? null, feeDenominator: feeDenominator ?? null, feeBps: feeBps ?? null,
      stateRef: serializeTopologyStateRef(stateRef),
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
export function deserializeTopology(adjacency: any) {
  const graph = new RoutingGraph();
  for (const edges of Object.values(adjacency) as any[]) {
    for (const e of edges) {
      graph.addEdge({ ...e, fee: e.fee ?? undefined, feeDenominator: e.feeDenominator ?? undefined, feeBps: e.feeBps ?? undefined, swapFn: null, stateRef: e.stateRef ?? null, metadata: null });
    }
  }
  return graph;
}
