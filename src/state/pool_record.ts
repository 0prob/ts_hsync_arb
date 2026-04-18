
/**
 * src/state/pool_record.js — Shared helpers for registry-backed pool records
 */

export function parsePoolMetadata(metadata) {
  return typeof metadata === "string"
    ? JSON.parse(metadata || "{}")
    : (metadata || {});
}

export function parsePoolTokens(tokens) {
  const resolved = Array.isArray(tokens) ? tokens : JSON.parse(tokens || "[]");
  return resolved.map((token) => token.toLowerCase());
}
