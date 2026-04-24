import assert from "node:assert/strict";

import { topic0ForSignature, topic0sForSignatures } from "../src/hypersync/topics.ts";
import { WATCHER_TOPIC0 } from "../src/state/watcher.ts";
import { handleWatcherLogs, toTopicArray } from "../src/state/watcher_state_ops.ts";
import { createWatcherProtocolHandlers } from "../src/state/watcher_protocol_handlers.ts";

const signatures = [
  "event Sync(uint112 reserve0, uint112 reserve1)",
  "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)",
];

const hashed = topic0sForSignatures(signatures);
assert.equal(hashed.length, signatures.length);
assert.equal(
  hashed[0],
  topic0ForSignature(signatures[0]),
  "batch topic hashing should match the single-signature helper",
);
assert.notEqual(
  topic0ForSignature(signatures[0]),
  topic0ForSignature(signatures[1]),
  "distinct event signatures should map to distinct topic0 values",
);

const handlers = createWatcherProtocolHandlers({
  topic0: WATCHER_TOPIC0,
  updateV2State: () => {},
  updateV3SwapState: () => {},
  updateV3LiquidityState: () => {},
});

assert.equal(
  handlers.get(WATCHER_TOPIC0.V2_SYNC) != null,
  true,
  "watcher handlers should dispatch Sync events by named topic hash",
);
assert.equal(
  handlers.get(WATCHER_TOPIC0.CURVE_EXCHANGE_CRYPTO) != null,
  true,
  "watcher handlers should dispatch curve crypto events by named topic hash",
);

assert.deepEqual(
  toTopicArray({ topics: [[WATCHER_TOPIC0.V2_SYNC], ["0xowner"], null] }),
  [WATCHER_TOPIC0.V2_SYNC, "0xowner"],
  "topic extraction should support HyperSync-style topics arrays in addition to topic0-topic3 fields",
);

{
  const registry = {
    getPoolMeta() {
      return {
        pool_address: "0xpool",
        protocol: "UNISWAP_V2",
        tokens: [
          "0x0000000000000000000000000000000000000001",
          "0x0000000000000000000000000000000000000002",
        ],
      };
    },
  };
  const cache = new Map([
    [
      "0xpool",
      {
        poolId: "0xpool",
        protocol: "UNISWAP_V2",
        tokens: [
          "0x0000000000000000000000000000000000000001",
          "0x0000000000000000000000000000000000000002",
        ],
        token0: "0x0000000000000000000000000000000000000001",
        token1: "0x0000000000000000000000000000000000000002",
        reserve0: 1n,
        reserve1: 2n,
        fee: 997n,
        timestamp: Date.now(),
      },
    ],
  ]);

  const changedAddrs = await handleWatcherLogs({
    logs: [
      {
        address: "0xpool",
        topics: [[WATCHER_TOPIC0.V2_SYNC]],
        blockNumber: 401,
        transactionIndex: 0,
        logIndex: 1,
      },
    ],
    decoded: [{ body: [{ val: 11n }, { val: 12n }] }],
    registry,
    cache,
    closed: () => false,
    topic0: WATCHER_TOPIC0,
    refreshBalancer: async () => {},
    refreshCurve: async () => {},
    enqueueEnrichment: () => Promise.resolve(),
    commitStates(updates: any[]) {
      for (const update of updates) {
        cache.set(update.addr, update.state);
      }
      return updates.map((update) => update.addr);
    },
  });

  assert.deepEqual(
    [...changedAddrs],
    ["0xpool"],
    "watcher log handling should dispatch events even when topics arrive in array form",
  );
  assert.equal(
    cache.get("0xpool")?.reserve0,
    11n,
    "topic-array watcher logs should still apply the decoded state update",
  );
}

console.log("Topic checks passed.");
