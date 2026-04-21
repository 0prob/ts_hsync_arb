import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { RegistryService } from "../src/db/registry.ts";
import { normalizeHydrationAddresses } from "../src/enrichment/token_hydrator_helpers.ts";

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

    const usdc = registry.getTokenMeta("0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB");
    assert.equal(usdc?.symbol, null, "blank token symbols should be normalized to null");
    assert.equal(usdc?.name, "USD Coin");

    const decimals = registry.getTokenDecimals([
      "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
      "",
    ]);
    assert.equal(decimals.size, 2, "duplicate and blank addresses should not amplify token decimals lookups");
    assert.equal(decimals.get("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"), 18);
    assert.equal(decimals.get("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"), 6);

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

console.log("Token metadata checks passed.");
