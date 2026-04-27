import assert from "node:assert/strict";

import { discoverPoolsWithDeps } from "../src/discovery/discover.ts";
import { PROTOCOLS } from "../src/protocols/index.ts";

const protocols = {
  QUICKSWAP_V2: PROTOCOLS.QUICKSWAP_V2,
  DFYN_V2: PROTOCOLS.DFYN_V2,
};

class FakeRegistry {
  counts = new Map<string, number>([
    ["QUICKSWAP_V2", 0],
    ["DFYN_V2", 7],
  ]);
  checkpoints = new Map<string, { last_block: number }>([
    ["QUICKSWAP_V2", { last_block: 123 }],
    ["DFYN_V2", { last_block: 456 }],
  ]);

  getPoolCountForProtocol(protocol: string) {
    return this.counts.get(protocol) ?? 0;
  }

  getCheckpoint(protocol: string) {
    return this.checkpoints.get(protocol) ?? null;
  }

  getPoolCount() {
    return [...this.counts.values()].reduce((sum, count) => sum + count, 0);
  }

  getActivePoolCount() {
    return this.getPoolCount();
  }
}

{
  const registry = new FakeRegistry();
  const result = await discoverPoolsWithDeps({
    registry: registry as any,
    protocols: protocols as any,
    getChainHeightFn: async () => 500,
    discoverProtocolFn: async (key: string) => ({
      discovered: key === "DFYN_V2" ? 2 : 0,
      checkpointBlock: registry.getCheckpoint(key)?.last_block ?? null,
      rollbackGuard: null,
      hydrationPromise: null,
    }),
    discoverCurveRemovalsFn: async () => ({ removed: 0, checkpointBlock: 500, rollbackGuard: null }),
    detectReorgFn: () => false,
    protocolConcurrency: 2,
  });

  assert.deepEqual(result.protocolCoverage, [
    {
      protocol: "QUICKSWAP_V2",
      name: "QuickSwap V2",
      activePools: 0,
      totalPools: 0,
      checkpointBlock: 123,
      discovered: 0,
      error: null,
    },
    {
      protocol: "DFYN_V2",
      name: "Dfyn V2",
      activePools: 7,
      totalPools: 7,
      checkpointBlock: 456,
      discovered: 2,
      error: null,
    },
  ]);
}

console.log("Discovery coverage checks passed.");
