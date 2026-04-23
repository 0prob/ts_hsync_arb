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
  assert.deepEqual(
    PROTOCOLS.KYBERSWAP_ELASTIC.capabilities,
    {
      discovery: true,
      routing: false,
      execution: false,
    },
    "KyberSwap Elastic should advertise discovery-only capabilities until routing/execution support is enabled",
  );
}

{
  assert("DFYN_V2" in PROTOCOLS, "DFYN V2 should be registered for discovery");
  const normalized = normalizePoolState(
    "0x1111111111111111111111111111111111111111",
    "DFYN_V2",
    ["0x2222222222222222222222222222222222222222", "0x3333333333333333333333333333333333333333"],
    {
      reserve0: 1_000n,
      reserve1: 2_000n,
      fetchedAt: Date.now(),
    },
  );

  assert(normalized, "DFYN V2 state should normalize via the V2 path");
  assert.equal(normalized?.protocol, "DFYN_V2");
  assert.equal(normalized?.fee, 997n);

  const graph = buildGraph(
    [
      {
        pool_address: "0x1111111111111111111111111111111111111111",
        protocol: "DFYN_V2",
        status: "active",
        tokens: ["0x2222222222222222222222222222222222222222", "0x3333333333333333333333333333333333333333"],
        metadata: {},
      },
    ],
    new Map([
      [
        "0x1111111111111111111111111111111111111111",
        {
          poolId: "0x1111111111111111111111111111111111111111",
          protocol: "DFYN_V2",
          token0: "0x2222222222222222222222222222222222222222",
          token1: "0x3333333333333333333333333333333333333333",
          tokens: ["0x2222222222222222222222222222222222222222", "0x3333333333333333333333333333333333333333"],
          reserve0: 1_000n,
          reserve1: 2_000n,
          fee: 997n,
          timestamp: Date.now(),
        },
      ],
    ]),
  );

  assert.equal(graph.edgeCount, 2, "DFYN V2 should route through the existing V2 graph path");
}

{
  const normalized = normalizePoolState(
    "0x1111111111111111111111111111111111111111",
    "KYBERSWAP_ELASTIC",
    ["0x2222222222222222222222222222222222222222", "0x3333333333333333333333333333333333333333"],
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
        pool_address: "0x1111111111111111111111111111111111111111",
        protocol: "KYBERSWAP_ELASTIC",
        status: "active",
        tokens: ["0x2222222222222222222222222222222222222222", "0x3333333333333333333333333333333333333333"],
        metadata: { isAlgebra: true, isKyberElastic: true, fee: 3000 },
      },
    ],
    new Map([
      [
        "0x1111111111111111111111111111111111111111",
        {
          poolId: "0x1111111111111111111111111111111111111111",
          protocol: "KYBERSWAP_ELASTIC",
          token0: "0x2222222222222222222222222222222222222222",
          token1: "0x3333333333333333333333333333333333333333",
          tokens: ["0x2222222222222222222222222222222222222222", "0x3333333333333333333333333333333333333333"],
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

{
  assert.deepEqual(
    PROTOCOLS.DFYN_V2.capabilities,
    {
      discovery: true,
      routing: true,
      execution: true,
    },
    "fully integrated V2 factories should advertise full capabilities",
  );
}

console.log("DEX coverage checks passed.");
