import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { rehydrateV3Ticks } from "../src/db/registry_codec.ts";
import { RegistryService } from "../src/db/registry.ts";

function makeTempDbPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "registry-integrity-"));
  return {
    dir,
    dbPath: path.join(dir, "registry.sqlite"),
  };
}

function cleanup(dir: string) {
  fs.rmSync(dir, { recursive: true, force: true });
}

const poolAddress = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const token0 = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const token1 = "0xcccccccccccccccccccccccccccccccccccccccc";

{
  const objectTicks = rehydrateV3Ticks({
    "-120": { liquidityGross: "100", liquidityNet: "-40" },
    "0": { liquidityGross: 200n, liquidityNet: 0n },
    bad: { liquidityGross: "1", liquidityNet: "1" },
  });
  assert.equal(objectTicks.size, 2, "object tick maps should skip non-integer tick keys");
  assert.deepEqual(objectTicks.get(-120), { liquidityGross: 100n, liquidityNet: -40n });
  assert.deepEqual(objectTicks.get(0), { liquidityGross: 200n, liquidityNet: 0n });

  const structuredCloneTicks = rehydrateV3Ticks(new Map<any, any>([
    [60, { liquidityGross: "300", liquidityNet: "25" }],
    ["120", { liquidityGross: "400", liquidityNet: "-25" }],
  ]));
  assert.deepEqual(
    [...structuredCloneTicks.entries()],
    [
      [60, { liquidityGross: 300n, liquidityNet: 25n }],
      [120, { liquidityGross: 400n, liquidityNet: -25n }],
    ],
    "structured-cloned Map tick data should be normalized like persisted object tick data",
  );

  const arrayTicks = rehydrateV3Ticks([
    [-60, { liquidityGross: "500", liquidityNet: "50" }],
    { tick: -30, liquidityGross: "600", liquidityNet: "-60" },
    ["nan", { liquidityGross: "1", liquidityNet: "1" }],
  ]);
  assert.deepEqual(
    [...arrayTicks.entries()],
    [
      [-60, { liquidityGross: 500n, liquidityNet: 50n }],
      [-30, { liquidityGross: 600n, liquidityNet: -60n }],
    ],
    "array-style tick map payloads should also rehydrate into numeric tick maps",
  );
}

{
  const { dir, dbPath } = makeTempDbPath();
  try {
    const registry = new RegistryService(dbPath);

    registry.upsertPool({
      pool_address: poolAddress,
      protocol: "UNISWAP_V2",
      tokens: [token0, token1],
      block: 10,
      tx: "0xcreate",
      metadata: {},
    });
    const poolBatchSummary = registry.batchUpsertPools([
      {
        pool_address: "bad-batch-pool",
        protocol: "UNISWAP_V2",
        tokens: [token0, token1],
        block: 9,
        tx: "0xbadbatch",
        metadata: {},
      },
      {
        pool_address: "0xdddddddddddddddddddddddddddddddddddddddd",
        protocol: "UNISWAP_V2",
        tokens: [token0, token1],
        block: 9,
        tx: "0xgoodbatch",
        metadata: {},
      },
    ]);
    assert.equal(poolBatchSummary?.skipped, 1, "batchUpsertPools should skip malformed pool rows");
    assert.equal(poolBatchSummary?.upserted, 1, "batchUpsertPools should still persist valid rows");
    assert.equal(
      registry.getPool("0xdddddddddddddddddddddddddddddddddddddddd")?.tx,
      "0xgoodbatch",
      "valid pool rows should survive mixed-validity batch upserts",
    );

    const stateBatchSummary = registry.batchUpdateStates([
      {
        pool_address: poolAddress,
        block: 50,
        data: { reserve0: 5000n, reserve1: 7000n },
      },
      {
        pool_address: poolAddress.toUpperCase(),
        block: 49,
        data: { reserve0: 1n, reserve1: 2n },
      },
      {
        pool_address: "not-a-pool-address",
        block: 51,
        data: { reserve0: 10n, reserve1: 20n },
      },
    ]);
    assert.equal(stateBatchSummary?.skipped, 1, "batchUpdateStates should skip malformed state rows");
    assert.equal(stateBatchSummary?.updated, 1, "batchUpdateStates should still persist the valid latest row");

    const state = registry.getPool(poolAddress)?.state;
    assert.equal(
      state?.block,
      50,
      "duplicate state updates in one batch should keep the newest block even when an older update appears later",
    );
    assert.equal(
      state?.data?.reserve0,
      5000n,
      "duplicate state batches should preserve the newest block payload",
    );
    assert.deepEqual(
      registry.getPool(poolAddress)?.tokens,
      [token0, token1],
      "valid pool token addresses should be preserved in normalized lowercase form",
    );

    assert.throws(
      () => registry.upsertPool({
        pool_address: "not-an-address",
        protocol: "UNISWAP_V2",
        tokens: [token0, token1],
        block: 11,
        tx: "0xbad",
        metadata: {},
      }),
      /valid pool_address/i,
      "pool upserts should reject malformed pool addresses",
    );

    registry.upsertPool({
      pool_address: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      protocol: "UNISWAP_V2",
      tokens: [token0, "not-a-token", token1, "0x0000000000000000000000000000000000000000"],
      block: 12,
      tx: "0xfiltered",
      metadata: {},
    });
    const v3PoolAddress = "0xffffffffffffffffffffffffffffffffffffffff";
    registry.upsertPool({
      pool_address: v3PoolAddress,
      protocol: "UNISWAP_V3",
      tokens: [token0, token1],
      block: 13,
      tx: "0xv3",
      metadata: { fee: "3000", tickSpacing: 60 },
    });
    registry.updatePoolState({
      pool_address: v3PoolAddress,
      block: 52,
      data: {
        protocol: "UNISWAP_V3",
        tokens: [token0, token1],
        initialized: true,
        sqrtPriceX96: 2n ** 96n,
        liquidity: 1000n,
        tick: 0,
        tickSpacing: 60,
        fee: 3000n,
        ticks: new Map([
          [-60, { liquidityGross: 100n, liquidityNet: 100n }],
          [60, { liquidityGross: 100n, liquidityNet: -100n }],
        ]),
      },
    });
    const v3State = registry.getPool(v3PoolAddress)?.state?.data;
    assert(v3State?.ticks instanceof Map, "registry V3 state reads should rehydrate persisted ticks into a Map");
    assert.deepEqual(
      [...v3State.ticks.entries()],
      [
        [-60, { liquidityGross: 100n, liquidityNet: 100n }],
        [60, { liquidityGross: 100n, liquidityNet: -100n }],
      ],
      "registry V3 state reads should preserve numeric tick keys and bigint liquidity values",
    );
    assert.deepEqual(
      registry.getPool("0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee")?.tokens,
      [token0, token1],
      "pool token parsing should drop malformed and zero token addresses",
    );

    assert.throws(
      () => registry.updatePoolState({
        pool_address: "0x9999999999999999999999999999999999999999",
        block: 51,
        data: { reserve0: 1n, reserve1: 2n },
      }),
      /constraint|foreign key/i,
      "registry state writes should not create orphan pool_state rows",
    );
    assert.throws(
      () => registry.updatePoolState({
        pool_address: "0x1234",
        block: 51,
        data: {},
      }),
      /valid pool_address/i,
      "state writes should reject malformed pool addresses before hitting SQLite",
    );

    registry.recordLiquidityEvent(poolAddress, 48, "large_change", "1", "2");
    registry.recordLiquidityEvent(poolAddress, 50, "large_change", "2", "3");
    const rollbackResult = registry.rollbackToBlock(50);

    assert.equal(rollbackResult.statesRemoved, 2, "rollback should remove all state rows at or above the reorg block");
    assert.equal(
      rollbackResult.liquidityEventsRemoved,
      1,
      "rollback should remove liquidity events at or above the reorg block",
    );
    assert.equal(
      registry.hasRecentLiquidityEvent(poolAddress, 49),
      false,
      "rolled-back liquidity events should no longer affect recent-change checks",
    );
    assert.equal(
      registry.hasRecentLiquidityEvent(poolAddress, 48),
      true,
      "pre-reorg liquidity events should remain available",
    );

    assert.throws(
      () => registry.updatePoolState({
        pool_address: poolAddress,
        block: -1,
        data: {},
      }),
      /invalid state block/i,
      "state updates should reject negative block numbers before hitting SQLite",
    );
    assert.throws(
      () => registry.upsertTokenMeta("0x1234", 18),
      /Token address is required/i,
      "token metadata writes should reject malformed token addresses",
    );
    const tokenMetaBatchSummary = registry.batchUpsertTokenMeta([
      { address: "0x1234", decimals: 18, symbol: "BAD" },
      { address: "0xdddddddddddddddddddddddddddddddddddddddd", decimals: 999, symbol: "BADDEC" },
      { address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", decimals: 18, symbol: "AAA" },
    ]);
    assert.equal(tokenMetaBatchSummary?.skipped, 2, "batchUpsertTokenMeta should skip malformed rows");
    assert.equal(tokenMetaBatchSummary?.upserted, 1, "batchUpsertTokenMeta should persist valid rows from a mixed batch");
    assert.equal(
      registry.getTokenMeta("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")?.symbol,
      "AAA",
      "valid token metadata rows should survive mixed-validity batch upserts",
    );
    assert.equal(
      registry.getTokenMeta("0x1234"),
      null,
      "token metadata reads should ignore malformed token addresses",
    );
    assert.throws(
      () => registry.upsertPoolFee("0x1234", 30),
      /Pool address is required/i,
      "pool fee writes should reject malformed pool addresses",
    );
    assert.equal(
      registry.getPoolFee("0x1234"),
      null,
      "pool fee reads should ignore malformed pool addresses",
    );

    registry.close();
  } finally {
    cleanup(dir);
  }
}

console.log("Registry integrity checks passed.");
