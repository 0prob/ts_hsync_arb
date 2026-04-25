import assert from "node:assert/strict";

import {
  edgeSpotLogWeight,
  find2HopPaths,
  findArbPaths,
} from "../src/routing/finder.ts";

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

function v2Edge(poolAddress: string, tokenIn: string, tokenOut: string, reserveIn = 1_000_000n) {
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
      reserve0: reserveIn,
      reserve1: 1_000_000n,
      fee: 997,
    },
  };
}

{
  const graph = new TestGraph();
  for (let i = 0; i < 4; i++) {
    graph.addEdge(v2Edge(`0xf${i}`, "a", "b"));
    graph.addEdge(v2Edge(`0xr${i}`, "b", "a"));
  }

  const paths = find2HopPaths(graph, "a", { maxPaths: 3 });
  assert.equal(paths.length, 3, "2-hop finder should honor maxPaths to prevent path explosions");
}

{
  const graph = new TestGraph();
  graph.addEdge(v2Edge("0xf1", "a", "b"));
  graph.addEdge(v2Edge("0xr1", "b", "a"));

  const paths = findArbPaths(graph, "a", {
    include2Hop: true,
    include3Hop: false,
    include4Hop: false,
    maxPathsPerToken: 1,
  });
  assert.equal(paths.length, 1, "aggregate finder should treat a single start-token string as one token, not characters");
  assert.equal(paths[0].startToken, "a");
}

{
  const hugeReserve = 10n ** 400n;
  const weight = edgeSpotLogWeight({
    protocol: "QUICKSWAP_V2",
    protocolKind: "v2",
    zeroForOne: true,
    fee: 997,
    stateRef: {
      reserve0: hugeReserve,
      reserve1: hugeReserve * 2n,
    },
  });
  assert.equal(typeof weight, "number");
  assert(Number.isFinite(weight), "V2 log weights should remain finite for very large bigint reserves");
}

{
  const badCurveWeight = edgeSpotLogWeight({
    protocol: "CURVE_STABLE_FACTORY",
    protocolKind: "other",
    tokenInIdx: 0,
    tokenOutIdx: 1,
    stateRef: {
      balances: [1_000_000n, 1_000_000n],
      A: 0n,
      fee: 0n,
    },
  });
  assert.equal(badCurveWeight, null, "quote-based log weights should fail closed when protocol simulation rejects state");
}

console.log("Finder checks passed.");
