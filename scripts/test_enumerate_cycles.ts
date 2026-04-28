import assert from "node:assert/strict";

import { enumerateCycles, enumerateCyclesDual } from "../src/routing/enumerate_cycles.ts";
import { HUB_4_TOKENS, POLYGON_HUB_TOKENS } from "../src/routing/graph.ts";

class TestGraph {
  adjacency = new Map<string, any[]>();
  tokens = new Set<string>();

  addEdge(edge: any) {
    if (!this.adjacency.has(edge.tokenIn)) this.adjacency.set(edge.tokenIn, []);
    this.adjacency.get(edge.tokenIn)!.push(edge);
    this.tokens.add(edge.tokenIn);
    this.tokens.add(edge.tokenOut);
  }

  getEdges(token: string) {
    return this.adjacency.get(token) ?? [];
  }

  getEdgesBetween(tokenIn: string, tokenOut: string) {
    return this.getEdges(tokenIn).filter((edge) => edge.tokenOut === tokenOut);
  }

  hasToken(token: string) {
    return this.tokens.has(token);
  }
}

function v2Edge(poolAddress: string, tokenIn: string, tokenOut: string, reserveOut = 1_000_000n) {
  return {
    protocol: "QUICKSWAP_V2",
    protocolKind: "v2",
    poolAddress,
    tokenIn,
    tokenOut,
    zeroForOne: true,
    fee: 997,
    feeBps: 30,
    stateRef: {
      reserve0: 1_000_000n,
      reserve1: reserveOut,
      fee: 997,
    },
  };
}

function balancerEdge(poolAddress: string, tokenIn: string, tokenOut: string, balances: bigint[]) {
  const tokens = [tokenIn, tokenOut];
  return {
    protocol: "BALANCER_V2",
    protocolKind: "other",
    poolAddress,
    tokenIn,
    tokenOut,
    tokenInIdx: 0,
    tokenOutIdx: 1,
    zeroForOne: true,
    feeBps: 30,
    stateRef: {
      protocol: "BALANCER_V2",
      tokens,
      balances,
      weights: [5n * 10n ** 17n, 5n * 10n ** 17n],
      swapFee: 3_000_000_000_000_000n,
      timestamp: Date.now(),
    },
  };
}

function v3Edge(poolAddress: string, tokenIn: string, tokenOut: string, liquidity: bigint) {
  const tokens = [tokenIn, tokenOut];
  return {
    protocol: "UNISWAP_V3",
    protocolKind: "v3",
    poolAddress,
    tokenIn,
    tokenOut,
    zeroForOne: true,
    fee: 3000,
    feeBps: 30,
    stateRef: {
      protocol: "UNISWAP_V3",
      tokens,
      initialized: true,
      sqrtPriceX96: 2n ** 96n,
      liquidity,
      timestamp: Date.now(),
    },
  };
}

function addTwoHopCycle(graph: TestGraph, poolPrefix: string, startToken: string, midToken: string, reserveOut = 1_000_000n) {
  graph.addEdge(v2Edge(`${poolPrefix}-f`, startToken, midToken, reserveOut));
  graph.addEdge(v2Edge(`${poolPrefix}-r`, midToken, startToken, reserveOut));
}

{
  const graph = new TestGraph();
  addTwoHopCycle(graph, "0x1", "a", "b");
  addTwoHopCycle(graph, "0x2", "a", "c");

  const paths = enumerateCycles(graph, {
    startTokens: " A ",
    hubTokensOnly: false,
    include2Hop: true,
    include3Hop: false,
    include4Hop: false,
    maxPathsPerToken: 10,
    maxTotalPaths: "1.9",
    dedup: false,
  });

  assert.equal(paths.length, 1, "single-graph enumeration should normalize string/fractional maxTotalPaths");
  assert.equal(paths[0].startToken, "a");
}

{
  const graph = new TestGraph();
  addTwoHopCycle(graph, "0x1", "a", "weak", 1_000_000n);
  addTwoHopCycle(graph, "0x2", "a", "strong", 100_000n);

  const paths = enumerateCycles(graph, {
    startTokens: new Set(["a"]),
    hubTokensOnly: false,
    include2Hop: true,
    include3Hop: false,
    include4Hop: false,
    maxPathsPerToken: 1,
    maxTotalPaths: 1,
    dedup: false,
  });

  assert.equal(paths.length, 1);
  assert.equal(
    paths[0].edges[0].tokenOut,
    "strong",
    "bounded 2-hop enumeration should retain the strongest log-weight route, not the first discovered route",
  );
}

{
  const hubToken = [...HUB_4_TOKENS][0];
  const fullOnlyHubToken = [...POLYGON_HUB_TOKENS].find((token) => !HUB_4_TOKENS.has(token));
  assert(fullOnlyHubToken, "test expects at least one full-only hub token");

  const hubGraph = new TestGraph();
  addTwoHopCycle(hubGraph, "0xh1", hubToken, "0xhubmid1");
  addTwoHopCycle(hubGraph, "0xh2", hubToken, "0xhubmid2");

  const fullGraph = new TestGraph();
  addTwoHopCycle(fullGraph, "0xf1", fullOnlyHubToken, "0xfullmid1");
  addTwoHopCycle(fullGraph, "0xf2", fullOnlyHubToken, "0xfullmid2");

  const paths = enumerateCyclesDual(hubGraph, fullGraph, {
    include2Hop: true,
    include3Hop: false,
    include4Hop: false,
    maxPathsPerToken: 10,
    max4HopPathsPerToken: 10,
    maxTotalPaths: "3.9",
    hubPathBudget: "1.9",
    dedup: false,
  });

  assert.equal(paths.length, 3, "dual enumeration should normalize total and phase budgets before capping paths");
  assert.equal(
    paths.filter((path: any) => path.startToken === hubToken).length,
    1,
    "dual enumeration should apply normalized hub budget before filling from the full phase",
  );
}

{
  const graph = new TestGraph();
  graph.addEdge(balancerEdge("0xbalancer", "a", "b", [1n, 1n]));
  graph.addEdge(v2Edge("0xreturn", "b", "a"));

  const baseOptions = {
    startTokens: new Set(["a"]),
    hubTokensOnly: false,
    include2Hop: true,
    include3Hop: false,
    include4Hop: false,
    maxPathsPerToken: 10,
    maxTotalPaths: 10,
    dedup: false,
    getRateWei: () => 1n,
  };

  assert.equal(enumerateCycles(graph, { ...baseOptions, minLiquidityWmatic: 0n }).length, 1);
  assert.equal(
    enumerateCycles(graph, { ...baseOptions, minLiquidityWmatic: 10n }).length,
    0,
    "liquidity pruning should apply to balance-based protocol pools, not only V2 reserves",
  );
}

{
  const graph = new TestGraph();
  graph.addEdge(v3Edge("0xv3", "a", "b", 1n));
  graph.addEdge(v2Edge("0xreturn", "b", "a"));

  const paths = enumerateCycles(graph, {
    startTokens: new Set(["a"]),
    hubTokensOnly: false,
    include2Hop: true,
    include3Hop: false,
    include4Hop: false,
    maxPathsPerToken: 10,
    maxTotalPaths: 10,
    minLiquidityWmatic: 10n,
    getRateWei: () => 1n,
    dedup: false,
  });

  assert.equal(paths.length, 0, "liquidity pruning should apply to V3 active liquidity estimates");
}

console.log("Enumeration checks passed.");
