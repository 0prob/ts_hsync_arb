import assert from "node:assert/strict";

import { detectReorg } from "../src/reorg/detect.ts";
import { StateWatcher } from "../src/state/watcher.ts";

const POOL_ADDRESS = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const TOKEN0 = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const TOKEN1 = "0xcccccccccccccccccccccccccccccccccccccccc";

function createV2State(reserve0: bigint, reserve1: bigint) {
  return {
    poolId: POOL_ADDRESS,
    protocol: "UNISWAP_V2",
    tokens: [TOKEN0, TOKEN1],
    token0: TOKEN0,
    token1: TOKEN1,
    reserve0,
    reserve1,
    fee: 997n,
    timestamp: Date.now(),
  };
}

function createRegistryStub() {
  return {
    getRollbackGuard() {
      return null;
    },
    updatePoolState() {},
    getPools() {
      return [];
    },
  };
}

async function testDetectReorgOnlyComparesMatchingBoundaries() {
  const registry = {
    getRollbackGuard() {
      return {
        block_number: 110,
        block_hash: "0xstored-head",
        first_block_number: 100,
        first_parent_hash: "0xstored-parent-99",
      };
    },
  };

  assert.equal(
    detectReorg(registry, {
      first_block_number: 110,
      first_parent_hash: "0xdifferent-head-parent",
    }),
    110,
    "reorg should be detected when the new guard disagrees about the stored head block parent",
  );

  assert.equal(
    detectReorg(registry, {
      first_block_number: 100,
      first_parent_hash: "0xother-parent-99",
    }),
    100,
    "reorg should be detected when both guards describe the same first block boundary",
  );

  assert.equal(
    detectReorg(registry, {
      first_block_number: 95,
      first_parent_hash: "0xunrelated-parent-94",
    }),
    false,
    "mismatched parent hashes must not trigger a rollback when the guards refer to different boundary blocks",
  );
}

async function testWatcherInvalidatesStaleEnrichmentAcrossReorg() {
  const cache = new Map([[POOL_ADDRESS, createV2State(1n, 2n)]]);
  const watcher = new StateWatcher(createRegistryStub(), cache) as any;

  let releaseStaleTask: (() => void) | null = null;
  const staleTask = watcher._enqueueEnrichment(POOL_ADDRESS, async (epoch: number) => {
    await new Promise<void>((resolve) => {
      releaseStaleTask = resolve;
    });
    watcher._commitState(POOL_ADDRESS, createV2State(50n, 60n), { blockNumber: 12 }, epoch);
  });

  watcher._advanceEnrichmentEpoch();
  cache.set(POOL_ADDRESS, createV2State(3n, 4n));

  releaseStaleTask?.();
  await staleTask;

  assert.equal(
    cache.get(POOL_ADDRESS)?.reserve0,
    3n,
    "stale enrichment should not overwrite reorg-reloaded cache state after the epoch changes",
  );

  await watcher._enqueueEnrichment(POOL_ADDRESS, async (epoch: number) => {
    watcher._commitState(POOL_ADDRESS, createV2State(70n, 80n), { blockNumber: 13 }, epoch);
  });

  assert.equal(
    cache.get(POOL_ADDRESS)?.reserve0,
    70n,
    "fresh enrichment should still be able to commit after reorg invalidation",
  );
}

await testDetectReorgOnlyComparesMatchingBoundaries();
await testWatcherInvalidatesStaleEnrichmentAcrossReorg();

console.log("Reorg checks passed.");
