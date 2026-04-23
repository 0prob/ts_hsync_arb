
/**
 * src/db/registry_pools.js — Pool persistence/query helpers for RegistryService
 */

import fs from "fs";
import {
  lowerCaseAddressList,
  mapPoolMetaRow,
  mapPoolRow,
  mapStalePoolRow,
  parseJson,
  stringifyWithBigInt,
} from "./registry_codec.ts";

function assertPoolAddress(metadata: any) {
  if (!metadata.pool_address) {
    throw new Error(
      `RegistryService: pool_address is required for protocol ${metadata.protocol}`
    );
  }
}

function normalizePoolUpsertRecord(pool: any) {
  assertPoolAddress(pool);
  return {
    ...pool,
    pool_address: String(pool.pool_address).toLowerCase(),
    protocol: String(pool.protocol ?? ""),
    tokens: lowerCaseAddressList(Array.isArray(pool.tokens) ? pool.tokens : parseJson(pool.tokens, [])),
    tx: pool.tx != null ? String(pool.tx) : "",
    metadata: pool.metadata ?? {},
    status: pool.status || "active",
  };
}

function normalizePoolUpsertBatch(poolList: any[]) {
  const latestByAddress = new Map<string, any>();
  for (const pool of poolList) {
    const normalized = normalizePoolUpsertRecord(pool);
    latestByAddress.set(normalized.pool_address, normalized);
  }
  return [...latestByAddress.values()];
}

function normalizeStateUpdateRecord(state: any) {
  if (!state?.pool_address) {
    throw new Error("RegistryService: pool_address is required for state update");
  }

  return {
    pool_address: String(state.pool_address).toLowerCase(),
    block: Number(state.block ?? 0),
    data: state.data,
  };
}

function normalizeStateUpdateBatch(stateList: any[]) {
  const latestByAddress = new Map<string, any>();
  for (const state of stateList) {
    const normalized = normalizeStateUpdateRecord(state);
    latestByAddress.set(normalized.pool_address, normalized);
  }
  return [...latestByAddress.values()];
}

export function upsertPool(db: any, stmt: any, invalidatePoolMetaCache: any, metadata: any) {
  assertPoolAddress(metadata);

  const upsertPoolStmt = stmt("upsertPool", `
    INSERT INTO pools (address, protocol, tokens, created_block, created_tx, metadata, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(address) DO UPDATE SET
      protocol = excluded.protocol,
      tokens   = excluded.tokens,
      created_block = excluded.created_block,
      created_tx    = excluded.created_tx,
      metadata = excluded.metadata,
      status   = excluded.status
  `);

  const result = upsertPoolStmt.run(
    metadata.pool_address.toLowerCase(),
    metadata.protocol,
    stringifyWithBigInt(lowerCaseAddressList(metadata.tokens || [])),
    metadata.block ?? 0,
    metadata.tx ?? "",
    stringifyWithBigInt(metadata.metadata || {}),
    metadata.status || "active"
  );
  invalidatePoolMetaCache();
  return result;
}

export function removePool(stmt: any, invalidatePoolMetaCache: any, address: any) {
  const result = stmt(
    "removePool",
    `UPDATE pools SET status = 'removed' WHERE address = ?`
  ).run(address.toLowerCase());
  invalidatePoolMetaCache();
  return result;
}

export function batchRemovePools(stmt: any, invalidatePoolMetaCache: any, db: any, addresses: any[]) {
  if (!Array.isArray(addresses) || addresses.length === 0) return 0;

  const removePoolStmt = stmt(
    "removePool",
    `UPDATE pools SET status = 'removed' WHERE address = ?`
  );

  const normalisedAddresses = [...new Set(addresses.map((address) => String(address).toLowerCase()))];
  const transaction = db.transaction((poolAddresses: string[]) => {
    let removed = 0;
    for (const address of poolAddresses) {
      const result = removePoolStmt.run(address);
      removed += Number(result?.changes ?? 0);
    }
    return removed;
  });

  const removed = transaction(normalisedAddresses);
  invalidatePoolMetaCache();
  return removed;
}

export function updatePoolState(stmt: any, state: any) {
  const normalized = normalizeStateUpdateRecord(state);

  return stmt("updatePoolState", `
    INSERT INTO pool_state (address, last_updated_block, state_data)
    VALUES (?, ?, ?)
    ON CONFLICT(address) DO UPDATE SET
      last_updated_block = excluded.last_updated_block,
      state_data         = excluded.state_data
  `).run(
    normalized.pool_address,
    normalized.block,
    stringifyWithBigInt(normalized.data)
  );
}

export function getPools(db: any, opts: any = {}) {
  let sql = `
    SELECT p.*, s.last_updated_block, s.state_data
    FROM pools p
    LEFT JOIN pool_state s ON p.address = s.address
  `;
  const conditions = [];
  const params = [];

  if (opts.protocol) {
    conditions.push("p.protocol = ?");
    params.push(opts.protocol);
  }
  if (opts.status) {
    conditions.push("p.status = ?");
    params.push(opts.status);
  }
  if (conditions.length > 0) {
    sql += " WHERE " + conditions.join(" AND ");
  }

  return db.prepare(sql).all(...params).map(mapPoolRow);
}

export function loadPoolMetaCache(stmt: any, status: string | null = null) {
  const cacheKey = status ? `getPoolMetaByStatus:${status}` : "getAllPoolMeta";
  const statusSql = status ? " WHERE status = ?" : "";
  const rows = stmt(
    cacheKey,
    `SELECT address, protocol, tokens, created_block, created_tx, metadata, status
     FROM pools${statusSql}`
  ).all(...(status ? [status] : []));
  const pools = rows.map(mapPoolMetaRow);

  if (status) {
    return pools;
  }

  return new Map(pools.map((pool: any) => [pool.pool_address, pool]));
}

export function getPool(stmt: any, address: any) {
  const row = stmt(
    "getPool",
    `SELECT p.*, s.last_updated_block, s.state_data
     FROM pools p
     LEFT JOIN pool_state s ON p.address = s.address
     WHERE p.address = ?`
  ).get(address.toLowerCase());
  return row ? mapPoolRow(row) : null;
}

export function getPoolCount(stmt: any) {
  return stmt("getPoolCount", `SELECT COUNT(*) as count FROM pools`).get().count;
}

export function getActivePoolCount(stmt: any) {
  return stmt(
    "getActivePoolCount",
    `SELECT COUNT(*) as count FROM pools WHERE status = 'active'`
  ).get().count;
}

export function getPoolCountForProtocol(stmt: any, protocol: string, status: string | null = null) {
  const cacheKey = status
    ? `getPoolCountForProtocol:${protocol}:${status}`
    : `getPoolCountForProtocol:${protocol}:all`;
  const sql = status
    ? `SELECT COUNT(*) as count FROM pools WHERE protocol = ? AND status = ?`
    : `SELECT COUNT(*) as count FROM pools WHERE protocol = ?`;
  const row = stmt(cacheKey, sql).get(...(status ? [protocol, status] : [protocol]));
  return Number(row?.count ?? 0);
}

export function getPoolAddressesForProtocol(stmt: any, protocol: string, status: string | null = null) {
  const cacheKey = status
    ? `getPoolAddressesForProtocol:${protocol}:${status}`
    : `getPoolAddressesForProtocol:${protocol}:all`;
  const sql = status
    ? `SELECT address FROM pools WHERE protocol = ? AND status = ?`
    : `SELECT address FROM pools WHERE protocol = ?`;
  return stmt(cacheKey, sql)
    .all(...(status ? [protocol, status] : [protocol]))
    .map((row: any) => String(row.address).toLowerCase());
}

export function batchUpsertPools(db: any, stmt: any, invalidatePoolMetaCache: any, poolList: any) {
  if (!Array.isArray(poolList) || poolList.length === 0) return;
  const normalizedPools = normalizePoolUpsertBatch(poolList);
  if (normalizedPools.length === 0) return;

  const upsertPoolStmt = stmt("upsertPool", `
    INSERT INTO pools (address, protocol, tokens, created_block, created_tx, metadata, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(address) DO UPDATE SET
      protocol = excluded.protocol,
      tokens   = excluded.tokens,
      created_block = excluded.created_block,
      created_tx    = excluded.created_tx,
      metadata = excluded.metadata,
      status   = excluded.status
  `);

  db.transaction((pools: any) => {
    for (const pool of pools) {
      upsertPoolStmt.run(
        pool.pool_address,
        pool.protocol,
        stringifyWithBigInt(pool.tokens || []),
        pool.block ?? 0,
        pool.tx,
        stringifyWithBigInt(pool.metadata),
        pool.status
      );
    }
  })(normalizedPools);

  invalidatePoolMetaCache();
}

export function batchUpdateStates(db: any, stmt: any, stateList: any) {
  if (!Array.isArray(stateList) || stateList.length === 0) return;
  const normalizedStates = normalizeStateUpdateBatch(stateList);
  if (normalizedStates.length === 0) return;

  const updatePoolStateStmt = stmt("updatePoolState", `
    INSERT INTO pool_state (address, last_updated_block, state_data)
    VALUES (?, ?, ?)
    ON CONFLICT(address) DO UPDATE SET
      last_updated_block = excluded.last_updated_block,
      state_data         = excluded.state_data
  `);

  db.transaction((states: any) => {
    for (const state of states) {
      updatePoolStateStmt.run(
        state.pool_address,
        state.block,
        stringifyWithBigInt(state.data),
      );
    }
  })(normalizedStates);
}

export function getPoolsWithState(db: any, opts: any = {}) {
  let sql = `
    SELECT p.*, s.last_updated_block, s.state_data
    FROM pools p
    INNER JOIN pool_state s ON p.address = s.address
    WHERE p.status = 'active'
  `;
  const params = [];

  if (opts.protocol) {
    sql += " AND p.protocol = ?";
    params.push(opts.protocol);
  }

  return db.prepare(sql).all(...params).map(mapPoolRow);
}

export function getStaleStatePools(db: any, staleThreshold: any) {
  const sql = `
    SELECT p.*
    FROM pools p
    LEFT JOIN pool_state s ON p.address = s.address
    WHERE p.status = 'active'
      AND (s.address IS NULL OR s.last_updated_block < ?)
  `;
  return db.prepare(sql).all(staleThreshold).map(mapStalePoolRow);
}

export function getPoolCountByProtocol(stmt: any) {
  const rows = stmt(
    "getPoolCountByProtocol",
    `SELECT protocol, COUNT(*) as count FROM pools WHERE status = 'active' GROUP BY protocol`
  ).all();
  const result: Record<string, any> = {};
  for (const row of rows) result[row.protocol] = row.count;
  return result;
}

export function loadSnapshot(batchUpsertPoolsImpl: any, snapshotPath: any) {
  if (!fs.existsSync(snapshotPath)) return;
  const pools = parseJson(fs.readFileSync(snapshotPath, "utf8"), []);
  batchUpsertPoolsImpl(pools);
}

export function saveSnapshot(getPoolsImpl: any, snapshotPath: any) {
  fs.writeFileSync(snapshotPath, stringifyWithBigInt(getPoolsImpl()));
}

export function disablePool(db: any, stmt: any, invalidatePoolMetaCache: any, recordLiquidityEventImpl: any, poolAddress: any, reason = "manual") {
  const normalizedAddress = poolAddress.toLowerCase();

  db.transaction(() => {
    stmt("disablePool", `UPDATE pools SET status = 'disabled' WHERE address = ?`)
      .run(normalizedAddress);
    recordLiquidityEventImpl(normalizedAddress, 0, "disabled", null, reason);
  })();

  invalidatePoolMetaCache();
}

export function enablePool(stmt: any, invalidatePoolMetaCache: any, poolAddress: any) {
  stmt("enablePool", `UPDATE pools SET status = 'active' WHERE address = ?`)
    .run(poolAddress.toLowerCase());
  invalidatePoolMetaCache();
}

export function recordLiquidityEvent(stmt: any, poolAddress: any, blockNumber: any, eventType: any, oldValue: any, newValue: any) {
  stmt(
    "recordLiquidityEvent",
    `INSERT INTO liquidity_events (address, block_number, event_type, old_value, new_value)
     VALUES (?, ?, ?, ?, ?)`
  ).run(
    poolAddress.toLowerCase(),
    blockNumber,
    eventType,
    oldValue != null ? String(oldValue) : null,
    newValue != null ? String(newValue) : null
  );
}

export function hasRecentLiquidityEvent(stmt: any, poolAddress: any, sinceBlock: any) {
  const row = stmt(
    "hasRecentLiquidityEvent",
    `SELECT COUNT(*) as count FROM liquidity_events
     WHERE address = ? AND block_number >= ? AND event_type != 'disabled'`
  ).get(poolAddress.toLowerCase(), sinceBlock);
  return row.count > 0;
}

export function detectLiquidityChange(recordLiquidityEventImpl: any, poolAddress: any, oldState: any, newState: any, blockNumber: any, thresholdPct = 50) {
  if (!oldState || !newState) return false;

  let changed = false;
  const threshold = BigInt(thresholdPct);

  if (oldState.reserve0 != null && newState.reserve0 != null) {
    const oldR: bigint = oldState.reserve0;
    const newR: bigint = newState.reserve0;
    if (oldR > 0n) {
      const changePct = ((newR > oldR ? newR - oldR : oldR - newR) * 100n) / oldR;
      if (changePct >= threshold) {
        recordLiquidityEventImpl(
          poolAddress,
          blockNumber,
          "large_change",
          oldR.toString(),
          newR.toString()
        );
        changed = true;
      }
    }

    if (newState.reserve0 < 1000n || newState.reserve1 < 1000n) {
      recordLiquidityEventImpl(
        poolAddress,
        blockNumber,
        "near_empty",
        null,
        `${newState.reserve0},${newState.reserve1}`
      );
      changed = true;
    }
  }

  if (oldState.liquidity != null && newState.liquidity != null) {
    const oldL: bigint = oldState.liquidity;
    const newL: bigint = newState.liquidity;
    if (oldL > 0n) {
      const changePct = ((newL > oldL ? newL - oldL : oldL - newL) * 100n) / oldL;
      if (changePct >= threshold) {
        recordLiquidityEventImpl(
          poolAddress,
          blockNumber,
          "large_change",
          oldL.toString(),
          newL.toString()
        );
        changed = true;
      }
    }
  }

  return changed;
}

export function validatePoolMetadata(pool: any) {
  const issues = [];
  const addr = pool.pool_address || pool.address;

  let tokens = pool.tokens;
  if (typeof tokens === "string") {
    tokens = parseJson(tokens, []);
  }

  if (!tokens || tokens.length < 2) {
    issues.push(`${addr}: fewer than 2 tokens`);
  } else {
    const seen = new Set();
    for (const t of tokens) {
      if (typeof t !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(t)) {
        issues.push(`${addr}: invalid token address: ${t}`);
      }
      if (seen.has(t.toLowerCase())) {
        issues.push(`${addr}: duplicate token ${t}`);
      }
      seen.add(t.toLowerCase());
    }
  }

  let meta = pool.metadata;
  if (typeof meta === "string") {
    meta = parseJson(meta, {});
  }
  meta = meta || {};

  if (pool.protocol && pool.protocol.includes("V3")) {
    if (meta.fee == null) issues.push(`${addr}: V3 pool missing fee`);
    if (meta.tickSpacing == null) issues.push(`${addr}: V3 pool missing tickSpacing`);
  }

  if (pool.protocol && pool.protocol.includes("BALANCER")) {
    if (!meta.poolId && !meta.pool_id) {
      issues.push(`${addr}: Balancer pool missing poolId`);
    }
  }

  return issues;
}

export function validateAllPools(getActivePoolsImpl: any, validatePoolMetadataImpl: any) {
  const pools = getActivePoolsImpl();
  const invalid = [];

  for (const pool of pools) {
    const issues = validatePoolMetadataImpl(pool);
    if (issues.length > 0) {
      invalid.push({ pool, issues });
    }
  }

  return invalid;
}
