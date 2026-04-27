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

{
  const sushiV2 = PROTOCOLS.SUSHISWAP_V2;

  assert.equal(protocolDiscoveryStartBlock(sushiV2), 0);
  assert.deepEqual(resolveDiscoveryFromBlock(sushiV2, undefined, 0), {
    fromBlock: 0,
    startBlock: 0,
    resumed: false,
    shouldBackfillEmptyProtocol: false,
  });
  assert.deepEqual(resolveDiscoveryFromBlock(sushiV2, HIGH_CHECKPOINT_BLOCK, 0), {
    fromBlock: 0,
    startBlock: 0,
    resumed: false,
    shouldBackfillEmptyProtocol: true,
  });
  assert.deepEqual(resolveDiscoveryFromBlock(sushiV2, HIGH_CHECKPOINT_BLOCK, 12), {
    fromBlock: HIGH_CHECKPOINT_BLOCK + 1,
    startBlock: 0,
    resumed: true,
    shouldBackfillEmptyProtocol: false,
  });

  const token0 = address(1);
  const token1 = address(2);
  const pair = address(3);
  const decoded = sushiV2.decode!({
    indexed: [{ val: token0 }, { val: token1 }],
    body: [{ val: pair }],
  });
  assert.equal(decoded.pool_address, pair);
  assert.deepEqual(decoded.tokens, [token0, token1]);
}

{
  const sushiV3 = PROTOCOLS.SUSHISWAP_V3;
  assert.equal(protocolDiscoveryStartBlock(sushiV3), 0);

  const token0 = address(11);
  const token1 = address(12);
  const pool = address(13);
  const decoded = sushiV3.decode!({
    indexed: [{ val: token0 }, { val: token1 }, { val: 500 }],
    body: [{ val: 10 }, { val: pool }],
  });
  assert.equal(decoded.pool_address, pool);
  assert.deepEqual(decoded.tokens, [token0, token1]);
  assert.equal(decoded.metadata.fee, "500");
  assert.equal(decoded.metadata.tickSpacing, "10");
}

console.log("Sushi discovery checks passed.");
