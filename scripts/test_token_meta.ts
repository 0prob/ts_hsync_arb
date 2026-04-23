import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { RegistryService } from "../src/db/registry.ts";
import { normalizeHydrationAddresses } from "../src/enrichment/token_hydrator_helpers.ts";
import { hydrateTokensWithDeps } from "../src/enrichment/token_hydrator.ts";

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
      "token metadata cached from batch upserts should remain available without rereading SQLite",
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

console.log("Token metadata checks passed.");
