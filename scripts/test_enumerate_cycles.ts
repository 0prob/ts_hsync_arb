import assert from "node:assert/strict";

import { HUB_4_TOKENS } from "../src/routing/graph.ts";
import { enumerateCycles, enumerateCyclesDual } from "../src/routing/enumerate_cycles.ts";

type Edge = {
  tokenIn: string;
  tokenOut: string;
  poolAddress: string;
  zeroForOne: boolean;
  protocol: string;
  protocolKind: string;
  fee: bigint;
  feeBps: number;
  stateRef: {
    reserve0: bigint;
    reserve1: bigint;
  };
};

class FakeGraph {
  tokens: Set<string>;
  private readonly edgesByToken = new Map<string, Edge[]>();

  constructor(edges: Edge[]) {
    this.tokens = new Set<string>();
    for (const edge of edges) {
      this.tokens.add(edge.tokenIn);
      this.tokens.add(edge.tokenOut);
      const bucket = this.edgesByToken.get(edge.tokenIn) ?? [];
      bucket.push(edge);
      this.edgesByToken.set(edge.tokenIn, bucket);
    }
  }

  hasToken(token: string) {
    return this.tokens.has(token);
  }

  getEdges(token: string) {
    return this.edgesByToken.get(token) ?? [];
  }

  getEdgesBetween(tokenIn: string, tokenOut: string) {
    return this.getEdges(tokenIn).filter((edge) => edge.tokenOut === tokenOut);
  }
}

function makeV2Edge(
  tokenIn: string,
  tokenOut: string,
  poolAddress: string,
  reserveIn: bigint,
  reserveOut: bigint,
): Edge {
  return {
    tokenIn,
    tokenOut,
    poolAddress,
    zeroForOne: true,
    protocol: "TEST_V2",
    protocolKind: "v2",
    fee: 997n,
    feeBps: 30,
    stateRef: {
      reserve0: reserveIn,
      reserve1: reserveOut,
    },
  };
}

const START = [...HUB_4_TOKENS][0];
assert.ok(START, "Expected HUB_4_TOKENS to provide at least one start token");

const graph = new FakeGraph([
  makeV2Edge(START, "B", "ab-fast", 1_000n, 608n),
  makeV2Edge("B", START, "ba-fast", 1_000n, 608n),
  makeV2Edge(START, "C", "ac-mid", 1_000n, 744n),
  makeV2Edge("C", START, "ca-mid", 1_000n, 744n),
  makeV2Edge(START, "D", "ad-slow", 1_000n, 907n),
  makeV2Edge("D", START, "da-slow", 1_000n, 907n),
]);

const topTwo = enumerateCycles(graph, {
  hubTokensOnly: false,
  startTokens: new Set([START]),
  include2Hop: true,
  include3Hop: false,
  include4Hop: false,
  maxTotalPaths: 2,
});

assert.equal(topTwo.length, 2, "enumerateCycles should respect maxTotalPaths");
assert.deepEqual(
  topTwo.map((path) => path.edges.map((edge: Edge) => edge.poolAddress).join(">")),
  ["ab-fast>ba-fast", "ac-mid>ca-mid"],
  "enumerateCycles should keep the best-ranked paths without sorting the full result set",
);

const fullGraphShouldNotBeUsed = {
  hasToken() {
    throw new Error("full graph should not be consulted when the hub budget already fills maxTotalPaths");
  },
  getEdges() {
    throw new Error("full graph should not be consulted when the hub budget already fills maxTotalPaths");
  },
  getEdgesBetween() {
    throw new Error("full graph should not be consulted when the hub budget already fills maxTotalPaths");
  },
};

const dualTopTwo = enumerateCyclesDual(graph, fullGraphShouldNotBeUsed, {
  include2Hop: true,
  include3Hop: false,
  maxTotalPaths: 2,
  hubPathBudget: 2,
});

assert.deepEqual(
  dualTopTwo.map((path) => path.edges.map((edge: Edge) => edge.poolAddress).join(">")),
  ["ab-fast>ba-fast", "ac-mid>ca-mid"],
  "enumerateCyclesDual should short-circuit the full graph once the hub phase exhausts the path budget",
);

const dualWithNegativeHubBudget = enumerateCyclesDual({
  hasToken() {
    throw new Error("hub graph should not be consulted when the hub budget is clamped to zero");
  },
  getEdges() {
    throw new Error("hub graph should not be consulted when the hub budget is clamped to zero");
  },
  getEdgesBetween() {
    throw new Error("hub graph should not be consulted when the hub budget is clamped to zero");
  },
}, graph, {
  include2Hop: true,
  include3Hop: false,
  maxTotalPaths: 2,
  hubPathBudget: -5,
});

assert.deepEqual(
  dualWithNegativeHubBudget.map((path) => path.edges.map((edge: Edge) => edge.poolAddress).join(">")),
  ["ab-fast>ba-fast", "ac-mid>ca-mid"],
  "enumerateCyclesDual should clamp negative hub budgets and fall back cleanly to the full-graph phase",
);

const longHopGraph = new FakeGraph([
  makeV2Edge(START, "B", "ab-1", 1_000n, 700n),
  makeV2Edge("B", "C", "bc-2", 1_000n, 700n),
  makeV2Edge("C", "D", "cd-3", 1_000n, 700n),
  makeV2Edge("D", "E", "de-4", 1_000n, 700n),
  makeV2Edge("E", START, "ea-5", 1_000n, 700n),
]);

const fiveHop = enumerateCycles(longHopGraph, {
  hubTokensOnly: false,
  startTokens: new Set([START]),
  include2Hop: false,
  include3Hop: false,
  include4Hop: true,
  maxHops: 5,
  max4HopPathsPerToken: 4,
  maxTotalPaths: 4,
});

assert.equal(fiveHop.length, 1, "enumerateCycles should discover bounded 5-hop routes when maxHops is raised");
assert.equal(fiveHop[0]?.hopCount, 5, "bounded long-hop discovery should preserve the canonical hop count");
assert.deepEqual(
  fiveHop[0]?.edges.map((edge: Edge) => edge.poolAddress),
  ["ab-1", "bc-2", "cd-3", "de-4", "ea-5"],
  "bounded long-hop discovery should keep the full execution order intact",
);

console.log("Cycle enumeration checks passed.");
