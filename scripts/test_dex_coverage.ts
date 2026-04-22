import assert from "node:assert/strict";

import { PROTOCOLS } from "../src/protocols/index.ts";
import { normalizePoolState } from "../src/state/normalizer.ts";
import { buildGraph } from "../src/routing/graph.ts";

{
  assert("KYBERSWAP_ELASTIC" in PROTOCOLS, "KyberSwap Elastic should be registered for discovery");
  assert.equal(
    PROTOCOLS.KYBERSWAP_ELASTIC.metadata,
    undefined,
    "protocol registry entries should remain protocol definitions, not hydrated pool instances",
  );
}

{
  const normalized = normalizePoolState(
    "0xpool",
    "KYBERSWAP_ELASTIC",
    ["0xt0", "0xt1"],
    {
      sqrtPriceX96: 1n,
      tick: 0,
      liquidity: 10n,
      fee: 3000,
      tickSpacing: 60,
      bitmaps: new Map(),
      ticks: new Map(),
      fetchedAt: Date.now(),
      initialized: true,
    },
    { isAlgebra: true, isKyberElastic: true },
  );

  assert(normalized, "KyberSwap Elastic state should normalize via the V3 path");
  assert.equal(normalized?.protocol, "KYBERSWAP_ELASTIC");
  assert.equal(normalized?.fee, 3000n);
}

{
  const graph = buildGraph(
    [
      {
        pool_address: "0xpool",
        protocol: "KYBERSWAP_ELASTIC",
        status: "active",
        tokens: ["0xt0", "0xt1"],
        metadata: { isAlgebra: true, isKyberElastic: true, fee: 3000 },
      },
    ],
    new Map([
      [
        "0xpool",
        {
          poolId: "0xpool",
          protocol: "KYBERSWAP_ELASTIC",
          tokens: ["0xt0", "0xt1"],
          sqrtPriceX96: 1n,
          tick: 0,
          liquidity: 10n,
          fee: 3000n,
          tickSpacing: 60,
          bitmaps: new Map(),
          ticks: new Map(),
          timestamp: Date.now(),
          initialized: true,
        },
      ],
    ]),
  );

  assert.equal(graph.edgeCount, 0, "KyberSwap Elastic should stay out of routing until execution support is enabled");
}

console.log("DEX coverage checks passed.");
