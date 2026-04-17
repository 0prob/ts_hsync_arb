// @ts-nocheck
/**
 * src/db/registry_assets.js — Token metadata and pool fee helpers
 */

const STMT_CACHE_KEY = Symbol.for("registry_assets_stmt_cache");

function assetStmt(db, key, sql) {
  let cache = db[STMT_CACHE_KEY];
  if (!cache) {
    cache = new Map();
    Object.defineProperty(db, STMT_CACHE_KEY, { value: cache });
  }
  if (!cache.has(key)) {
    cache.set(key, db.prepare(sql));
  }
  return cache.get(key);
}

export function upsertTokenMeta(db, address, decimals, symbol = null, name = null) {
  assetStmt(
    db,
    "upsertTokenMeta",
      `INSERT INTO token_meta (address, decimals, symbol, name, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(address) DO UPDATE SET
         decimals   = excluded.decimals,
         symbol     = COALESCE(excluded.symbol, token_meta.symbol),
         name       = COALESCE(excluded.name, token_meta.name),
         updated_at = excluded.updated_at`
  )
    .run(address.toLowerCase(), decimals, symbol, name);
}

export function getTokenMeta(db, address) {
  return (
    assetStmt(db, "getTokenMeta", `SELECT * FROM token_meta WHERE address = ?`)
      .get(address.toLowerCase()) || null
  );
}

export function getTokenDecimals(db, addresses) {
  const result = new Map();
  if (!Array.isArray(addresses) || addresses.length === 0) return result;

  const CHUNK = 900;
  const lower = addresses.map((a) => a.toLowerCase());

  for (let i = 0; i < lower.length; i += CHUNK) {
    const batch = lower.slice(i, i + CHUNK);
    const placeholders = batch.map(() => "?").join(",");
    const rows = assetStmt(
      db,
      `getTokenDecimals:${batch.length}`,
      `SELECT address, decimals FROM token_meta WHERE address IN (${placeholders})`
    ).all(...batch);
    for (const row of rows) {
      result.set(row.address, row.decimals);
    }
  }

  return result;
}

export function batchUpsertTokenMeta(db, tokens, upsertTokenMetaImpl = upsertTokenMeta) {
  db.transaction((list) => {
    for (const t of list) {
      upsertTokenMetaImpl(db, t.address, t.decimals, t.symbol, t.name);
    }
  })(tokens);
}

export function upsertPoolFee(db, poolAddress, feeBps, feeRaw = null, protocol = null) {
  assetStmt(
    db,
    "upsertPoolFee",
      `INSERT INTO pool_fees (address, fee_bps, fee_raw, protocol, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(address) DO UPDATE SET
         fee_bps    = excluded.fee_bps,
         fee_raw    = excluded.fee_raw,
         protocol   = COALESCE(excluded.protocol, pool_fees.protocol),
         updated_at = excluded.updated_at`
  )
    .run(poolAddress.toLowerCase(), feeBps, feeRaw, protocol);
}

export function getPoolFee(db, poolAddress) {
  const row = assetStmt(
    db,
    "getPoolFee",
    `SELECT fee_bps, fee_raw FROM pool_fees WHERE address = ?`
  ).get(poolAddress.toLowerCase());
  return row ? { feeBps: row.fee_bps, feeRaw: row.fee_raw } : null;
}
