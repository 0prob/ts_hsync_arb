import assert from "node:assert/strict";

import {
  protocolDiscoveryStartBlock,
  resolveDiscoveryFromBlock,
} from "../src/discovery/discover.ts";
import { PROTOCOLS } from "../src/protocols/index.ts";

const HIGH_CHECKPOINT_BLOCK = 44_000_000;

function address(index: number) {
  return `0x${index.toString(16).padStart(40, "0")}`;
}

for (const key of ["QUICKSWAP_V2", "QUICKSWAP_V3"] as const) {
  const protocol = PROTOCOLS[key];
  assert.equal(protocolDiscoveryStartBlock(protocol), 0);
  assert.deepEqual(resolveDiscoveryFromBlock(protocol, undefined, 0), {
    fromBlock: 0,
    startBlock: 0,
    resumed: false,
    shouldBackfillEmptyProtocol: false,
  });
  assert.deepEqual(resolveDiscoveryFromBlock(protocol, HIGH_CHECKPOINT_BLOCK, 0), {
    fromBlock: 0,
    startBlock: 0,
    resumed: false,
    shouldBackfillEmptyProtocol: true,
  });
  assert.deepEqual(resolveDiscoveryFromBlock(protocol, HIGH_CHECKPOINT_BLOCK, 8), {
    fromBlock: HIGH_CHECKPOINT_BLOCK + 1,
    startBlock: 0,
    resumed: true,
    shouldBackfillEmptyProtocol: false,
  });
}

{
  const quickV2 = PROTOCOLS.QUICKSWAP_V2;
  const token0 = address(1);
  const token1 = address(2);
  const pair = address(3);
  const decoded = quickV2.decode!({
    indexed: [{ val: token0 }, { val: token1 }],
    body: [{ val: pair }],
  });
  assert.equal(decoded.pool_address, pair);
  assert.deepEqual(decoded.tokens, [token0, token1]);
}

{
  const quickV3 = PROTOCOLS.QUICKSWAP_V3;
  const token0 = address(11);
  const token1 = address(12);
  const pool = address(13);
  const decoded = quickV3.decode!({
    indexed: [{ val: token0 }, { val: token1 }],
    body: [{ val: pool }],
  });
  assert.equal(decoded.pool_address, pool);
  assert.deepEqual(decoded.tokens, [token0, token1]);
  assert.equal(decoded.metadata.fee, null);
  assert.equal(decoded.metadata.tickSpacing, null);
  assert.equal(decoded.metadata.isAlgebra, true);
}

console.log("QuickSwap discovery checks passed.");
