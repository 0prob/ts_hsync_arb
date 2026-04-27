import assert from "node:assert/strict";

import {
  protocolDiscoveryStartBlock,
  resolveDiscoveryFromBlock,
} from "../src/discovery/discover.ts";
import { CURVE_POOL_REMOVED, PROTOCOLS } from "../src/protocols/index.ts";

function isActiveLogDiscoveryProtocol(protocol: any) {
  if (!protocol?.signature && !protocol?.signatures?.length) return false;
  if (typeof protocol.discover === "function") return false;
  if (protocol.capabilities?.discovery === false) return false;
  if (protocol.capabilities?.execution === false) return false;
  return true;
}

{
  assert.equal(protocolDiscoveryStartBlock(undefined), 0);
  assert.equal(protocolDiscoveryStartBlock({ startBlock: -1 }), 0);
  assert.equal(protocolDiscoveryStartBlock({ startBlock: Number.NaN }), 0);
  assert.equal(protocolDiscoveryStartBlock({ startBlock: 12.5 }), 0);
  assert.equal(protocolDiscoveryStartBlock({ startBlock: 0 }), 0);
}

{
  const resolved = resolveDiscoveryFromBlock({ startBlock: 500 }, 400, 0);
  assert.deepEqual(resolved, {
    fromBlock: 500,
    startBlock: 500,
    resumed: false,
    shouldBackfillEmptyProtocol: false,
  });
}

{
  assert.deepEqual(resolveDiscoveryFromBlock({ startBlock: 500 }, 750, 4), {
    fromBlock: 751,
    startBlock: 500,
    resumed: true,
    shouldBackfillEmptyProtocol: false,
  });
  assert.deepEqual(resolveDiscoveryFromBlock({ startBlock: 500 }, 750, 0), {
    fromBlock: 500,
    startBlock: 500,
    resumed: false,
    shouldBackfillEmptyProtocol: true,
  });
}

{
  const missingExplicitStart = Object.entries(PROTOCOLS)
    .filter(([, protocol]) => isActiveLogDiscoveryProtocol(protocol))
    .filter(([, protocol]) => !Number.isSafeInteger(Number((protocol as any).startBlock)))
    .map(([key]) => key);

  assert.deepEqual(missingExplicitStart, []);
}

{
  assert.equal(protocolDiscoveryStartBlock(CURVE_POOL_REMOVED), 0);
  assert.deepEqual(resolveDiscoveryFromBlock(CURVE_POOL_REMOVED, undefined, 1), {
    fromBlock: 0,
    startBlock: 0,
    resumed: false,
    shouldBackfillEmptyProtocol: false,
  });
}

console.log("Genesis discovery policy checks passed.");
