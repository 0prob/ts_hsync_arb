import assert from "node:assert/strict";

import { topic0ForSignature, topic0sForSignatures } from "../src/hypersync/topics.ts";
import { WATCHER_TOPIC0 } from "../src/state/watcher.ts";
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

console.log("Topic checks passed.");
