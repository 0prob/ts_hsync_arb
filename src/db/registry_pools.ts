
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
import { normalizeEvmAddress, parsePoolMetadataValue, parsePoolTokensValue } from "../util/pool_record.ts";
import { isBalancerProtocol, isV3Protocol, normalizeProtocolKey } from "../protocols/classification.ts";

const POOL_STATUSES = new Set(["active", "disabled", "removed"]);

function normalizeRequiredAddress(value: any, label: string) {
  const normalizedAddress = normalizeEvmAddress(value);
  if (!normalizedAddress) {
    throw new Error(
      `RegistryService: valid ${label} is required`
    );
  }
  return normalizedAddress;
}

function assertPoolAddress(metadata: any) {
  normalizeRequiredAddress(metadata?.pool_address, `pool_address for protocol ${metadata?.protocol}`);
}

function normalizePoolStatus(value: any) {
  const trimmed = value == null ? "" : String(value).trim();
  const status = (trimmed || "active").toLowerCase();
  if (!POOL_STATUSES.has(status)) {
    throw new Error(`RegistryService: invalid pool status: ${value}`);
  }
  return status;
}

function normalizePoolBlock(value: any, label: string, fallback: number | null = null) {
  if (value == null || value === "") return fallback;
  const block = Number(value);
  if (!Number.isSafeInteger(block) || block < 0) {
    throw new Error(`RegistryService: invalid ${label}: ${value}`);
  }
  return block;
}

function normalizePoolUpsertRecord(pool: any) {
  assertPoolAddress(pool);
  const removedBlock = pool.removed_block ?? pool.removedBlock ?? null;
  const protocol = normalizeProtocolKey(pool.protocol);
  if (!protocol) {
    throw new Error(`RegistryService: protocol is required for pool ${pool.pool_address}`);
  }
  const status = normalizePoolStatus(pool.status);
  const normalizedRemovedBlock = normalizePoolBlock(removedBlock, "removed_block", null);
  return {
    ...pool,
    pool_address: normalizeRequiredAddress(pool.pool_address, `pool_address for protocol ${protocol}`),
    protocol,
    block: normalizePoolBlock(pool.block ?? pool.created_block ?? pool.createdBlock, "created block", 0),
    tokens: lowerCaseAddressList(
      Array.isArray(pool.tokens) ? pool.tokens : parsePoolTokensValue(pool.tokens),
    ),
    tx: pool.tx != null ? String(pool.tx) : "",
    metadata: parsePoolMetadataValue(pool.metadata),
    status,
    removed_block: status === "removed" ? normalizedRemovedBlock : null,
  };
}

function normalizePoolUpsertBatch(poolList: any[]) {
  const latestByAddress = new Map<string, any>();
  let skipped = 0;
  for (const pool of poolList) {
    try {
      const normalized = normalizePoolUpsertRecord(pool);
      latestByAddress.set(normalized.pool_address, normalized);
    } catch {
      skipped++;
    }
  }
  return { records: [...latestByAddress.values()], skipped };
}

function normalizeStateUpdateRecord(state: any) {
  if (!state?.pool_address) {
    throw new Error("RegistryService: pool_address is required for state update");
  }

  const block = Number(state.block ?? 0);
  if (!Number.isSafeInteger(block) || block < 0) {
    throw new Error(`RegistryService: invalid state block for ${state.pool_address}: ${state.block}`);
  }

  return {
    pool_address: normalizeRequiredAddress(state.pool_address, "pool_address for state update"),
    block,
    data: state.data,
  };
}

function normalizeStateUpdateBatch(stateList: any[]) {
  const latestByAddress = new Map<string, any>();
  let skipped = 0;
  for (const state of stateList) {
    try {
      const normalized = normalizeStateUpdateRecord(state);
      const prior = latestByAddress.get(normalized.pool_address);
      if (!prior || normalized.block >= prior.block) {
        latestByAddress.set(normalized.pool_address, normalized);
      }
    } catch {
      skipped++;
    }
  }
  return { records: [...latestByAddress.values()], skipped };
}

export function upsertPool(stmt: any, invalidatePoolMetaCache: any, metadata: any) {
  const normalized = normalizePoolUpsertRecord(metadata);

  const upsertPoolStmt = stmt("upsertPool", `
    INSERT INTO pools (address, protocol, tokens, created_block, created_tx, metadata, status, removed_block)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(address) DO UPDATE SET
      protocol = excluded.protocol,
      tokens   = excluded.tokens,
      created_block = excluded.created_block,
      created_tx    = excluded.created_tx,
      metadata = excluded.metadata,
      status   = excluded.status,
      removed_block = excluded.removed_block
  `);

  const result = upsertPoolStmt.run(
    normalized.pool_address,
    normalized.protocol,
    stringifyWithBigInt(normalized.tokens),
    normalized.block ?? 0,
    normalized.tx,
    stringifyWithBigInt(normalized.metadata),
    normalized.status,
    normalized.removed_block,
  );
  invalidatePoolMetaCache();
  return result;
}

export function removePool(stmt: any, invalidatePoolMetaCache: any, address: any) {
  const normalizedAddress = normalizeRequiredAddress(address, "pool address");
  const result = stmt(
    "removePool",
    `UPDATE pools SET status = 'removed' WHERE address = ?`
  ).run(normalizedAddress);
  invalidatePoolMetaCache();
  return result;
}

export function batchRemovePools(stmt: any, invalidatePoolMetaCache: any, db: any, removals: any[]) {
  if (!Array.isArray(removals) || removals.length === 0) return 0;

  const removePoolStmt = stmt(
    "removePool",
    `UPDATE pools
     SET status = 'removed',
         removed_block = CASE
           WHEN removed_block IS NULL THEN ?
           ELSE removed_block
         END
     WHERE address = ?`
  );

  const removalByAddress = new Map<string, number | null>();
  for (const removal of removals) {
    const addressValue =
      typeof removal === "string"
        ? removal
        : removal?.address ?? removal?.pool_address ?? null;
    const normalizedAddress = normalizeEvmAddress(addressValue);
    if (!normalizedAddress) continue;
    const removalBlockRaw =
      typeof removal === "string"
        ? null
        : removal?.removed_block ?? removal?.removedBlock ?? removal?.block ?? null;
    const removalBlock =
      removalBlockRaw == null || removalBlockRaw === ""
        ? null
        : Number(removalBlockRaw);
    const finiteRemovalBlock = Number.isFinite(removalBlock) ? removalBlock : null;
    const prior = removalByAddress.get(normalizedAddress);
    if (prior == null) {
      removalByAddress.set(normalizedAddress, finiteRemovalBlock);
      continue;
    }
    if (finiteRemovalBlock != null && (prior == null || finiteRemovalBlock < prior)) {
      removalByAddress.set(normalizedAddress, finiteRemovalBlock);
    }
  }

  const transaction = db.transaction((entries: Array<[string, number | null]>) => {
    let removed = 0;
    for (const [address, removedBlock] of entries) {
      const result = removePoolStmt.run(removedBlock, address);
      removed += Number(result?.changes ?? 0);
    }
    return removed;
  });

  const removed = transaction([...removalByAddress.entries()]);
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
    WHERE excluded.last_updated_block >= pool_state.last_updated_block
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
    params.push(normalizeProtocolKey(opts.protocol));
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
    `SELECT address, protocol, tokens, created_block, created_tx, metadata, status, removed_block
     FROM pools${statusSql}`
  ).all(...(status ? [status] : []));
  const pools = rows.map(mapPoolMetaRow);

  if (status) {
    return pools;
  }

  return new Map(pools.map((pool: any) => [pool.pool_address, pool]));
}

export function getPool(stmt: any, address: any) {
  const normalizedAddress = normalizeEvmAddress(address);
  if (!normalizedAddress) return null;

  const row = stmt(
    "getPool",
    `SELECT p.*, s.last_updated_block, s.state_data
     FROM pools p
     LEFT JOIN pool_state s ON p.address = s.address
     WHERE p.address = ?`
  ).get(normalizedAddress);
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
  const protocolKey = normalizeProtocolKey(protocol);
  const cacheKey = status
    ? `getPoolCountForProtocol:${protocolKey}:${status}`
    : `getPoolCountForProtocol:${protocolKey}:all`;
  const sql = status
    ? `SELECT COUNT(*) as count FROM pools WHERE protocol = ? AND status = ?`
    : `SELECT COUNT(*) as count FROM pools WHERE protocol = ?`;
  const row = stmt(cacheKey, sql).get(...(status ? [protocolKey, status] : [protocolKey]));
  return Number(row?.count ?? 0);
}

export function getPoolAddressesForProtocol(stmt: any, protocol: string, status: string | null = null) {
  const protocolKey = normalizeProtocolKey(protocol);
  const cacheKey = status
    ? `getPoolAddressesForProtocol:${protocolKey}:${status}`
    : `getPoolAddressesForProtocol:${protocolKey}:all`;
  const sql = status
    ? `SELECT address FROM pools WHERE protocol = ? AND status = ?`
    : `SELECT address FROM pools WHERE protocol = ?`;
  return stmt(cacheKey, sql)
    .all(...(status ? [protocolKey, status] : [protocolKey]))
    .map((row: any) => String(row.address).toLowerCase());
}

export function batchUpsertPools(db: any, stmt: any, invalidatePoolMetaCache: any, poolList: any) {
  if (!Array.isArray(poolList) || poolList.length === 0) return { upserted: 0, skipped: 0 };
  const { records: normalizedPools, skipped } = normalizePoolUpsertBatch(poolList);
  if (normalizedPools.length === 0) return { upserted: 0, skipped };

  const upsertPoolStmt = stmt("upsertPool", `
    INSERT INTO pools (address, protocol, tokens, created_block, created_tx, metadata, status, removed_block)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(address) DO UPDATE SET
      protocol = excluded.protocol,
      tokens   = excluded.tokens,
      created_block = excluded.created_block,
      created_tx    = excluded.created_tx,
      metadata = excluded.metadata,
      status   = excluded.status,
      removed_block = excluded.removed_block
  `);

  const upserted = db.transaction((pools: any) => {
    let changes = 0;
    for (const pool of pools) {
      const result = upsertPoolStmt.run(
        pool.pool_address,
        pool.protocol,
        stringifyWithBigInt(pool.tokens || []),
        pool.block ?? 0,
        pool.tx,
        stringifyWithBigInt(pool.metadata),
        pool.status,
        pool.removed_block,
      );
      changes += Number(result?.changes ?? 0);
    }
    return changes;
  })(normalizedPools);

  invalidatePoolMetaCache();
  return { upserted, skipped };
}

export function batchUpdateStates(db: any, stmt: any, stateList: any) {
  if (!Array.isArray(stateList) || stateList.length === 0) return { updated: 0, skipped: 0 };
  const { records: normalizedStates, skipped } = normalizeStateUpdateBatch(stateList);
  if (normalizedStates.length === 0) return { updated: 0, skipped };

  const updatePoolStateStmt = stmt("updatePoolState", `
    INSERT INTO pool_state (address, last_updated_block, state_data)
    VALUES (?, ?, ?)
    ON CONFLICT(address) DO UPDATE SET
      last_updated_block = excluded.last_updated_block,
      state_data         = excluded.state_data
    WHERE excluded.last_updated_block >= pool_state.last_updated_block
  `);

  const updated = db.transaction((states: any) => {
    let changes = 0;
    for (const state of states) {
      const result = updatePoolStateStmt.run(
        state.pool_address,
        state.block,
        stringifyWithBigInt(state.data),
      );
      changes += Number(result?.changes ?? 0);
    }
    return changes;
  })(normalizedStates);
  return { updated, skipped };
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
    params.push(normalizeProtocolKey(opts.protocol));
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
  const normalizedAddress = normalizeRequiredAddress(poolAddress, "pool address");

  db.transaction(() => {
    stmt("disablePool", `UPDATE pools SET status = 'disabled' WHERE address = ?`)
      .run(normalizedAddress);
    recordLiquidityEventImpl(normalizedAddress, 0, "disabled", null, reason);
  })();

  invalidatePoolMetaCache();
}

export function enablePool(stmt: any, invalidatePoolMetaCache: any, poolAddress: any) {
  const normalizedAddress = normalizeRequiredAddress(poolAddress, "pool address");
  stmt("enablePool", `UPDATE pools SET status = 'active' WHERE address = ?`)
    .run(normalizedAddress);
  invalidatePoolMetaCache();
}

export function recordLiquidityEvent(stmt: any, poolAddress: any, blockNumber: any, eventType: any, oldValue: any, newValue: any) {
  const normalizedAddress = normalizeRequiredAddress(poolAddress, "pool address");
  stmt(
    "recordLiquidityEvent",
    `INSERT INTO liquidity_events (address, block_number, event_type, old_value, new_value)
     VALUES (?, ?, ?, ?, ?)`
  ).run(
    normalizedAddress,
    blockNumber,
    eventType,
    oldValue != null ? String(oldValue) : null,
    newValue != null ? String(newValue) : null
  );
}

export function hasRecentLiquidityEvent(stmt: any, poolAddress: any, sinceBlock: any) {
  const normalizedAddress = normalizeEvmAddress(poolAddress);
  if (!normalizedAddress) return false;

  const row = stmt(
    "hasRecentLiquidityEvent",
    `SELECT COUNT(*) as count FROM liquidity_events
     WHERE address = ? AND block_number >= ? AND event_type != 'disabled'`
  ).get(normalizedAddress, sinceBlock);
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
  const protocolKey = normalizeProtocolKey(pool.protocol);

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
        continue;
      }
      if (seen.has(t.toLowerCase())) {
        issues.push(`${addr}: duplicate token ${t}`);
      }
      seen.add(t.toLowerCase());
    }
  }

  let meta = pool.metadata;
  meta = parsePoolMetadataValue(meta);

  const isAlgebraStyleV3 = protocolKey === "QUICKSWAP_V3" || meta.isAlgebra === true;
  if (isV3Protocol(protocolKey) && !isAlgebraStyleV3) {
    if (meta.fee == null) issues.push(`${addr}: V3 pool missing fee`);
    if (meta.tickSpacing == null) issues.push(`${addr}: V3 pool missing tickSpacing`);
  }

  if (isBalancerProtocol(protocolKey)) {
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
