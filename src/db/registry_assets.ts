
/**
 * src/db/registry_assets.js — Token metadata and pool fee helpers
 */

import { normalizeEvmAddress } from "../util/pool_record.ts";
import { normalizeProtocolKey } from "../protocols/classification.ts";

function assetStmt(db: any, key: any, sql: any) {
  return db.statement(key, sql);
}

function normalizeTokenAddress(address: any) {
  return normalizeEvmAddress(address);
}

function normalizePoolAddress(address: any) {
  return normalizeEvmAddress(address);
}

function normalizeTokenText(value: any) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

function normalizePoolFeeBps(feeBps: any) {
  const normalized = Number(feeBps);
  if (!Number.isSafeInteger(normalized) || normalized < 0 || normalized > 10_000) {
    throw new Error(`Invalid pool fee bps: ${feeBps}`);
  }
  return normalized;
}

export function normalizeTokenDecimals(decimals: any) {
  const numeric = Number(decimals);
  if (!Number.isInteger(numeric) || numeric < 0 || numeric > 255) {
    throw new Error(`Invalid token decimals: ${decimals}`);
  }
  return numeric;
}

export function upsertTokenMeta(db: any, address: any, decimals: any, symbol: any = null, name: any = null) {
  const normalizedAddress = normalizeTokenAddress(address);
  if (!normalizedAddress) {
    throw new Error("Token address is required");
  }
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
    .run(
      normalizedAddress,
      normalizeTokenDecimals(decimals),
      normalizeTokenText(symbol),
      normalizeTokenText(name),
    );
}

export function getTokenMeta(db: any, address: any) {
  const normalizedAddress = normalizeTokenAddress(address);
  if (!normalizedAddress) return null;
  return (
    assetStmt(db, "getTokenMeta", `SELECT * FROM token_meta WHERE address = ?`)
      .get(normalizedAddress) || null
  );
}

export function getTokenDecimals(db: any, addresses: any) {
  const result = new Map();
  if (!Array.isArray(addresses) || addresses.length === 0) return result;

  const CHUNK = 900;
  const lower = [...new Set(addresses.map(normalizeTokenAddress).filter(Boolean))];

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

export function batchUpsertTokenMeta(db: any, tokens: any, upsertTokenMetaImpl = upsertTokenMeta) {
  if (!Array.isArray(tokens) || tokens.length === 0) return { upserted: 0, skipped: 0, tokens: [] };

  const merged = new Map();
  let skipped = 0;
  for (const token of tokens) {
    const normalizedAddress = normalizeTokenAddress(token?.address);
    if (!normalizedAddress) {
      skipped++;
      continue;
    }

    const prior = merged.get(normalizedAddress);
    let decimals: number;
    try {
      decimals = normalizeTokenDecimals(token?.decimals);
    } catch {
      skipped++;
      continue;
    }
    const next = {
      address: normalizedAddress,
      decimals,
      symbol: normalizeTokenText(token?.symbol),
      name: normalizeTokenText(token?.name),
    };

    merged.set(normalizedAddress, {
      ...prior,
      ...next,
      symbol: next.symbol ?? prior?.symbol ?? null,
      name: next.name ?? prior?.name ?? null,
    });
  }

  if (merged.size === 0) return { upserted: 0, skipped, tokens: [] };

  const persisted = [...merged.values()];
  const upserted = db.transaction((list: any) => {
    let changes = 0;
    for (const t of list) {
      upsertTokenMetaImpl(db, t.address, t.decimals, t.symbol, t.name);
      changes++;
    }
    return changes;
  })(persisted);

  return { upserted, skipped, tokens: persisted };
}

export function upsertPoolFee(db: any, poolAddress: any, feeBps: any, feeRaw = null, protocol = null) {
  const normalizedAddress = normalizePoolAddress(poolAddress);
  if (!normalizedAddress) {
    throw new Error("Pool address is required");
  }
  const normalizedFeeBps = normalizePoolFeeBps(feeBps);
  const normalizedProtocol = protocol == null ? null : normalizeProtocolKey(protocol);
  const normalizedFeeRaw = feeRaw == null ? null : String(feeRaw);

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
    .run(normalizedAddress, normalizedFeeBps, normalizedFeeRaw, normalizedProtocol);
}

export function getPoolFee(db: any, poolAddress: any) {
  const normalizedAddress = normalizePoolAddress(poolAddress);
  if (!normalizedAddress) return null;

  const row = assetStmt(
    db,
    "getPoolFee",
    `SELECT fee_bps, fee_raw FROM pool_fees WHERE address = ?`
  ).get(normalizedAddress);
  return row ? { feeBps: row.fee_bps, feeRaw: row.fee_raw } : null;
}
