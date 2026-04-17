// @ts-nocheck
/**
 * src/db/registry_codec.js — Shared JSON/row conversion helpers for RegistryService
 */

export function stringifyWithBigInt(obj) {
  return JSON.stringify(obj, (_key, value) =>
    typeof value === "bigint" ? value.toString() : value
  );
}

export function parseJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value !== "string") return value;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function lowerCaseAddressList(values = []) {
  return values.map((value) =>
    typeof value === "string" ? value.toLowerCase() : value
  );
}

export function mapPoolRow(row) {
  return {
    pool_address: row.address,
    protocol: row.protocol,
    tokens: parseJson(row.tokens, []),
    block: row.created_block,
    tx: row.created_tx,
    metadata: parseJson(row.metadata, {}),
    status: row.status || "active",
    state: row.state_data
      ? { block: row.last_updated_block, data: parseJson(row.state_data, null) }
      : null,
  };
}

export function mapPoolMetaRow(row) {
  return {
    pool_address: row.address,
    protocol: row.protocol,
    tokens: parseJson(row.tokens, []),
    block: row.created_block,
    tx: row.created_tx,
    metadata: parseJson(row.metadata, {}),
    status: row.status || "active",
    state: null,
  };
}

export function mapStalePoolRow(row) {
  return {
    pool_address: row.address,
    protocol: row.protocol,
    tokens: parseJson(row.tokens, []),
    metadata: parseJson(row.metadata, {}),
  };
}

export function mapArbHistoryRow(row) {
  return {
    ...row,
    pools: parseJson(row.pools, []),
    protocols: parseJson(row.protocols, []),
  };
}
