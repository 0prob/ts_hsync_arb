import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { RegistryService } from "../src/db/registry.ts";
import {
  mapArbHistoryRow,
  mapPoolMetaRow,
  mapPoolRow,
  mapStalePoolRow,
  normalizeAddress,
} from "../src/db/registry_codec.ts";
import { parsePoolMetadata, parsePoolTokens } from "../src/state/pool_record.ts";

function makeTempDbPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "registry-test-"));
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

    registry.batchUpsertPools([
      {
        pool_address: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        protocol: "UNISWAP_V2",
        tokens: [
          "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
          "0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC",
        ],
        block: 10,
        tx: "0xdeadbeef",
        metadata: { factory: "0xDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD" },
      },
      {
        pool_address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        protocol: "UNISWAP_V2",
        tokens: [
          "0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC",
          "0xDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD",
        ],
        block: 11,
        tx: "0xbeadfeed",
        metadata: { factory: "0xEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE" },
      },
    ]);

    const dedupedPool = registry.getPool("0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
    assert.deepEqual(
      dedupedPool?.tokens,
      [
        "0xcccccccccccccccccccccccccccccccccccccccc",
        "0xdddddddddddddddddddddddddddddddddddddddd",
      ],
      "batchUpsertPools should keep the latest record for duplicate pool addresses in the same batch",
    );
    assert.equal(dedupedPool?.tx, "0xbeadfeed");

    const activeBeforeDisable = registry.getActivePoolsMeta();
    assert.equal(activeBeforeDisable.length, 1, "active meta cache should contain the inserted pool");
    assert.equal(
      registry._metaCache._poolMetaCache,
      null,
      "loading active pool metadata should not eagerly build the full pool meta cache",
    );
    assert.equal(
      registry.getPoolMeta("0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")?.pool_address,
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "active pool lookups should resolve from the active metadata cache",
    );
    assert.equal(
      registry._metaCache._poolMetaCache,
      null,
      "active pool lookups should not force the full pool meta cache to build",
    );

    registry.disablePool("0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "test disable");

    const disabled = registry.getDisabledPools();
    assert.equal(disabled.length, 1, "disablePool should move the pool into disabled status");
    assert.equal(disabled[0].status, "disabled");
    assert.equal(
      registry.hasRecentLiquidityEvent("0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", 0),
      false,
      "disabled liquidity events should not count as recent liquidity changes",
    );

    const disabledEvents = registry.db
      .statement(
        "test:getDisabledEvents",
        "SELECT address, event_type, new_value FROM liquidity_events WHERE event_type = 'disabled'",
      )
      .all();
    assert.equal(disabledEvents.length, 1, "disablePool should record one disabled liquidity event");
    assert.equal(disabledEvents[0].address, "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    assert.equal(disabledEvents[0].new_value, "test disable");
    assert.equal(
      registry.getPoolMeta("0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")?.status,
      "disabled",
      "disabled pool lookups should still fall back to the full metadata cache",
    );
    assert(registry._metaCache._poolMetaCache, "disabled lookups should hydrate the full pool metadata cache on demand");

    registry.enablePool("0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
    const activeAfterEnable = registry.getActivePoolsMeta();
    assert.equal(activeAfterEnable.length, 1, "enablePool should repopulate the active metadata view");

    registry.batchUpdateStates([
      {
        pool_address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        block: 49,
        data: {
          poolId: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          protocol: "UNISWAP_V2",
          tokens: [
            "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            "0xcccccccccccccccccccccccccccccccccccccccc",
          ],
          reserve0: 900n,
          reserve1: 1900n,
          timestamp: Date.now() - 1,
        },
      },
      {
        pool_address: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        block: 50,
        data: {
          poolId: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          protocol: "UNISWAP_V2",
          tokens: [
            "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            "0xcccccccccccccccccccccccccccccccccccccccc",
          ],
          reserve0: 1000n,
          reserve1: 2000n,
          timestamp: Date.now(),
        },
      },
    ]);
    const stateRow = registry.db
      .statement(
        "test:getPoolStateRow",
        "SELECT address, last_updated_block, state_data FROM pool_state WHERE address = ?",
      )
      .get("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    assert.equal(stateRow.last_updated_block, 50, "batchUpdateStates should keep the latest state for duplicate addresses in the same batch");
    assert.match(String(stateRow.state_data), /"reserve0":"1000"/, "batchUpdateStates should persist the last state payload for duplicate addresses");
    registry.setCheckpoint("UNISWAP_V2", 50, "0xhash");

    const rollbackResult = registry.rollbackToBlock(50);
    assert.equal(rollbackResult.statesRemoved, 1, "rollback should remove state rows at or above the block");
    assert.equal(rollbackResult.poolsRemoved, 0, "rollback should not remove older pools");
    assert.equal(
      registry.getCheckpoint("UNISWAP_V2")?.last_block,
      49,
      "rollback should rewind checkpoints above the rollback block",
    );

    registry.close();
  } finally {
    cleanup(dir);
  }
}

{
  const mappedPool = mapPoolRow({
    address: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    protocol: "UNISWAP_V2",
    tokens: JSON.stringify([
      "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
      "0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC",
    ]),
    created_block: 1,
    created_tx: "0xHASH",
    metadata: JSON.stringify({ note: "ok" }),
    status: "active",
    state_data: null,
    last_updated_block: null,
  });
  assert.equal(mappedPool.pool_address, "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  assert.deepEqual(mappedPool.tokens, [
    "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "0xcccccccccccccccccccccccccccccccccccccccc",
  ]);

  const mappedMeta = mapPoolMetaRow({
    address: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    protocol: "CURVE_MAIN",
    tokens: ["0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB"],
    created_block: 1,
    created_tx: "0xHASH",
    metadata: "{}",
    status: "active",
  });
  assert.equal(mappedMeta.pool_address, "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  assert.deepEqual(mappedMeta.tokens, ["0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"]);

  const mappedStale = mapStalePoolRow({
    address: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    protocol: "BALANCER_V2",
    tokens: JSON.stringify(["0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB"]),
    metadata: "{}",
  });
  assert.equal(mappedStale.pool_address, "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  assert.deepEqual(mappedStale.tokens, ["0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"]);

  const mappedHistory = mapArbHistoryRow({
    tx_hash: "0xABCDEF",
    start_token: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    pools: JSON.stringify([
      "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
      "0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC",
    ]),
    protocols: JSON.stringify(["UNISWAP_V2"]),
  });
  assert.equal(mappedHistory.start_token, "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  assert.equal(mappedHistory.tx_hash, "0xabcdef");
  assert.deepEqual(mappedHistory.pools, [
    "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "0xcccccccccccccccccccccccccccccccccccccccc",
  ]);

  assert.equal(
    normalizeAddress("0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"),
    "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  );
  assert.deepEqual(
    parsePoolTokens('["0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",1]'),
    ["0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "1"],
  );
  assert.deepEqual(parsePoolTokens("{"), [], "invalid token JSON should not throw");
  assert.deepEqual(parsePoolMetadata("{"), {}, "invalid metadata JSON should not throw");
}

console.log("Registry checks passed.");
