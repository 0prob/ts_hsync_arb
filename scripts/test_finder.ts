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
  const graph = new TestGraph();
  graph.addEdge(v2Edge("0xf1", "a", "b"));
  graph.addEdge(v2Edge("0xr1", "b", "a"));

  const paths = findArbPaths(graph, [" A ", "a", "missing"], {
    include2Hop: true,
    include3Hop: false,
    include4Hop: false,
    maxPathsPerToken: 10,
  });

  assert.equal(paths.length, 1, "aggregate finder should normalize and dedupe start tokens before graph lookup");
  assert.equal(paths[0].startToken, "a");
}

{
  const graph = new TestGraph();
  for (let i = 0; i < 3; i++) {
    graph.addEdge(v2Edge(`0xf${i}`, "a", `b${i}`));
    graph.addEdge(v2Edge(`0xr${i}`, `b${i}`, "a"));
    graph.addEdge(v2Edge(`0xt${i}`, "a", `c${i}`));
    graph.addEdge(v2Edge(`0xu${i}`, `c${i}`, `d${i}`));
    graph.addEdge(v2Edge(`0xv${i}`, `d${i}`, "a"));
  }

  const paths = findArbPaths(graph, "a", {
    include2Hop: true,
    include3Hop: true,
    include4Hop: false,
    maxPathsPerToken: 4,
  });

  assert.equal(
    paths.length,
    4,
    "aggregate finder should apply maxPathsPerToken across 2-hop and 3-hop paths, not per depth",
  );
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

{
  const graph = new TestGraph();
  graph.addEdge({
    protocol: "BALANCER_V2",
    protocolKind: "other",
    poolAddress: "0xstable",
    tokenIn: "a",
    tokenOut: "b",
    tokenInIdx: 0,
    tokenOutIdx: 1,
    zeroForOne: true,
    stateRef: {
      protocol: "BALANCER_V2",
      tokens: ["a", "b"],
      balances: [0n, 1_000_000n],
      scalingFactors: [1_000_000_000_000_000_000n, 1_000_000_000_000_000_000n],
      amp: 1_000_000n,
      ampPrecision: 1_000n,
      swapFee: 1_000_000_000_000_000n,
      isStable: true,
    },
  });
  graph.addEdge(v2Edge("0xreturn", "b", "a"));

  assert.equal(
    find2HopPaths(graph, "a", { maxPaths: 10 }).length,
    0,
    "Balancer stable edges with invalid balances should be pruned before path emission",
  );
}

console.log("Finder checks passed.");
