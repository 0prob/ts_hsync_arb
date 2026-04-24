import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { RegistryService } from "../src/db/registry.ts";
import { normalizeHydrationAddresses } from "../src/enrichment/token_hydrator_helpers.ts";
import { decodeBytes32Text, hydrateTokensWithDeps, mergeMetadataBatchResults } from "../src/enrichment/token_hydrator.ts";

function makeTempDbPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "token-meta-test-"));
  return {
    dir,
    dbPath: path.join(dir, "registry.sqlite"),
  };
}

function cleanup(dir: string) {
  fs.rmSync(dir, { recursive: true, force: true });
}

{
  const { dir, dbPath } = makeTempDbPath();
  try {
    const registry = new RegistryService(dbPath);

    registry.batchUpsertTokenMeta([
      {
        address: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        decimals: 18,
        symbol: " WETH ",
      },
      {
        address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        decimals: 18,
        name: " Wrapped Ether ",
      },
      {
        address: "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
        decimals: 6,
        symbol: "",
        name: " USD Coin ",
      },
    ]);

    const weth = registry.getTokenMeta("0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
    assert.equal(weth?.address, "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    assert.equal(weth?.decimals, 18);
    assert.equal(weth?.symbol, "WETH");
    assert.equal(weth?.name, "Wrapped Ether");
    const usdcBeforeDelete = registry.getTokenMeta("0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB");
    assert.equal(usdcBeforeDelete?.symbol, null, "blank token symbols should be normalized to null");
    assert.equal(
      usdcBeforeDelete?.name,
      "USD Coin",
      "token metadata reads should normalize blank symbols and retain token names",
    );
    assert.equal(
      registry.db.statement("test:tokenMetaCount", "SELECT COUNT(*) as count FROM token_meta").get().count,
      2,
      "test fixture should persist two token metadata rows",
    );
    registry.db.statement("test:clearTokenMetaRows", "DELETE FROM token_meta").run();
    assert.equal(
      registry.getTokenMeta("0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")?.symbol,
      "WETH",
      "token metadata lookups should reuse the in-memory registry cache after the first read",
    );

    const usdc = registry.getTokenMeta("0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB");
    assert.equal(usdc?.symbol, null, "blank token symbols should be normalized to null");
    assert.equal(
      usdc?.name,
      "USD Coin",
      "token metadata should remain available from the read-through cache without rereading SQLite",
    );

    const decimals = registry.getTokenDecimals([
      "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
      "",
    ]);
    assert.equal(decimals.size, 2, "duplicate and blank addresses should not amplify token decimals lookups");
    assert.equal(decimals.get("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"), 18);
    assert.equal(decimals.get("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"), 6);
    assert.equal(
      registry.getTokenDecimals([
        "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
      ]).size,
      2,
      "token decimals lookups should also resolve from the registry cache after SQLite rows are gone",
    );

    assert.throws(
      () => registry.batchUpsertTokenMeta([{ address: "0xcccccccccccccccccccccccccccccccccccccccc", decimals: 256 }]),
      /Invalid token decimals/,
      "invalid token decimals should fail fast",
    );

    registry.db.statement(
      "test:insertPoisonedTokenMeta",
      "INSERT OR REPLACE INTO token_meta (address, decimals, symbol, name, updated_at) VALUES (?, ?, ?, ?, datetime('now'))",
    ).run(
      "0xffffffffffffffffffffffffffffffffffffffff",
      6.8,
      "BAD",
      "Poisoned Token",
    );
    assert.equal(
      registry.getTokenMeta("0xffffffffffffffffffffffffffffffffffffffff"),
      null,
      "token metadata reads should reject poisoned decimals rows instead of caching malformed decimals",
    );
    assert.equal(
      registry.getTokenDecimals(["0xffffffffffffffffffffffffffffffffffffffff"]).size,
      0,
      "token decimals lookups should skip poisoned decimals rows instead of returning malformed values",
    );
    registry.invalidateAssetCaches();
    registry.db.statement(
      "test:repairPoisonedTokenMeta",
      "UPDATE token_meta SET decimals = ? WHERE address = ?",
    ).run(8, "0xffffffffffffffffffffffffffffffffffffffff");
    assert.deepEqual(
      registry.getTokenMeta("0xffffffffffffffffffffffffffffffffffffffff"),
      {
        address: "0xffffffffffffffffffffffffffffffffffffffff",
        decimals: 8,
        symbol: "BAD",
        name: "Poisoned Token",
      },
      "after cache invalidation, repaired token metadata rows should become readable again",
    );

    registry.upsertPoolFee("0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC", 30, "3000", "UNISWAP_V3");
    assert.deepEqual(
      registry.getPoolFee("0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC"),
      { feeBps: 30, feeRaw: "3000" },
      "pool fee lookups should expose persisted fee metadata",
    );
    registry.db.statement("test:clearPoolFeeRows", "DELETE FROM pool_fees").run();
    assert.deepEqual(
      registry.getPoolFee("0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC"),
      { feeBps: 30, feeRaw: "3000" },
      "pool fee lookups should reuse the in-memory registry cache after the first read",
    );

    registry.invalidateAssetCaches();
    assert.equal(
      registry.getTokenMeta("0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"),
      null,
      "invalidating asset caches should drop cached token metadata when backing rows are gone",
    );
    assert.equal(
      registry.getPoolFee("0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC"),
      null,
      "invalidating asset caches should also drop cached pool fee lookups when backing rows are gone",
    );

    registry.upsertTokenMeta(
      "0xDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD",
      18,
      "DAI",
      "Dai Stablecoin",
    );
    registry.invalidateAssetCaches();
    registry.upsertTokenMeta("0xDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD", 18);
    assert.deepEqual(
      registry.getTokenMeta("0xDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD"),
      {
        address: "0xdddddddddddddddddddddddddddddddddddddddd",
        decimals: 18,
        symbol: "DAI",
        name: "Dai Stablecoin",
      },
      "partial token metadata upserts should not poison the cache with null symbol or name when SQLite preserves prior values",
    );

    registry.batchUpsertTokenMeta([
      {
        address: "0xEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE",
        decimals: 6,
        symbol: "USDT",
        name: "Tether USD",
      },
    ]);
    registry.invalidateAssetCaches();
    registry.batchUpsertTokenMeta([
      {
        address: "0xEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE",
        decimals: 6,
      },
    ]);
    assert.deepEqual(
      registry.getTokenMeta("0xEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE"),
      {
        address: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
        decimals: 6,
        symbol: "USDT",
        name: "Tether USD",
      },
      "batch partial token metadata upserts should also reload preserved metadata from SQLite instead of caching incomplete rows",
    );

    registry.close();
  } finally {
    cleanup(dir);
  }
}

assert.deepEqual(
  normalizeHydrationAddresses([
    "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    " 0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB ",
    "0x0000000000000000000000000000000000000000",
    "",
    null,
  ]),
  [
    "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  ],
  "hydration address normalization should lowercase, dedupe, and drop zero or blank addresses",
);

assert.equal(
  decodeBytes32Text("0x5553444300000000000000000000000000000000000000000000000000000000"),
  "USDC",
  "bytes32 token metadata should decode trailing-null-padded ASCII values",
);
assert.equal(
  decodeBytes32Text("0x0000000000000000000000000000000000000000000000000000000000000000"),
  null,
  "all-zero bytes32 metadata should decode to null",
);

assert.deepEqual(
  mergeMetadataBatchResults(
    ["0xaaa", "0xbbb"],
    [
      { status: "success", result: 18n },
      { status: "failure", error: "legacy symbol bytes32" },
      { status: "success", result: "Token A" },
      { status: "success", result: 6n },
      { status: "success", result: "USDC" },
      { status: "failure", error: "legacy name bytes32" },
    ],
    new Map([
      [0, { symbol: "WETH" }],
      [1, { name: "USD Coin" }],
    ]),
  ),
  [
    { address: "0xaaa", decimals: 18, symbol: "WETH", name: "Token A" },
    { address: "0xbbb", decimals: 6, symbol: "USDC", name: "USD Coin" },
  ],
  "metadata batch merging should fall back to bytes32 values only for fields whose string calls failed",
);

assert.deepEqual(
  mergeMetadataBatchResults(
    ["0xccc", "0xddd"],
    [
      { status: "success", result: { bad: "shape" } },
      { status: "success", result: { also: "bad" } },
      { status: "success", result: "  " },
      { status: "success", result: 18.5 },
      { status: "success", result: " USDT " },
      { status: "success", result: ["bad"] },
    ],
    new Map([
      [0, { symbol: "WBTC", name: "Wrapped BTC" }],
      [1, { name: "Tether USD" }],
    ]),
  ),
  [
    { address: "0xccc", decimals: null, symbol: "WBTC", name: "Wrapped BTC" },
    { address: "0xddd", decimals: null, symbol: "USDT", name: "Tether USD" },
  ],
  "metadata batch merging should reject malformed successful viem results instead of stringifying objects or fractional decimals",
);

{
  const persisted: any[] = [];
  const registry = {
    getTokenDecimals() {
      return new Map();
    },
    batchUpsertTokenMeta(rows: any[]) {
      persisted.push(...rows);
    },
  };

  let inFlight = 0;
  let maxInFlight = 0;
  const hydrated = await hydrateTokensWithDeps(
    Array.from({ length: 450 }, (_, i) => `0x${String(i + 1).padStart(40, "0")}`),
    registry,
    {
      concurrency: 2,
      async fetchMetaBatch(addresses: string[]) {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await sleep(10);
        inFlight--;
        return addresses.map((address) => ({
          address,
          decimals: 18,
          symbol: null,
          name: null,
        }));
      },
    },
  );

  assert.equal(hydrated, 450, "parallel token hydration should persist every fetched token");
  assert.equal(persisted.length, 450, "parallel token hydration should batch-persist every hydrated token");
  assert.equal(maxInFlight, 2, "token hydration should process multicall batches in parallel up to the configured limit");
}

{
  const persisted: any[] = [];
  const registry = {
    getTokenDecimals() {
      return new Map();
    },
    batchUpsertTokenMeta(rows: any[]) {
      persisted.push(...rows);
    },
  };

  const hydrated = await hydrateTokensWithDeps(
    [
      "0x1111111111111111111111111111111111111111",
      "0x2222222222222222222222222222222222222222",
      "0x3333333333333333333333333333333333333333",
    ],
    registry,
    {
      async fetchMetaBatch(addresses: string[]) {
        return addresses.map((address, index) => {
          if (index === 0) {
            return {
              address,
              decimals: 18,
              symbol: "WETH",
              name: "Wrapped Ether",
            };
          }
          if (index === 1) {
            return {
              address,
              decimals: 6,
              symbol: "USDC",
              name: null,
            };
          }
          return {
            address,
            decimals: 8,
            symbol: null,
            name: "Legacy Token",
          };
        });
      },
    },
  );

  assert.equal(hydrated, 3, "token hydration should persist rows even when symbol or name is unavailable");
  assert.deepEqual(
    persisted,
    [
      {
        address: "0x1111111111111111111111111111111111111111",
        decimals: 18,
        symbol: "WETH",
        name: "Wrapped Ether",
      },
      {
        address: "0x2222222222222222222222222222222222222222",
        decimals: 6,
        symbol: "USDC",
        name: null,
      },
      {
        address: "0x3333333333333333333333333333333333333333",
        decimals: 8,
        symbol: null,
        name: "Legacy Token",
      },
    ],
    "token hydration should preserve partial metadata instead of dropping otherwise valid rows",
  );
}

console.log("Token metadata checks passed.");
