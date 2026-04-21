
/**
 * src/state/pool_record.js — Shared helpers for registry-backed pool records
 */

import { parsePoolMetadataValue, parsePoolTokensValue } from "../util/pool_record.ts";

export function parsePoolMetadata(metadata: any) {
  return parsePoolMetadataValue(metadata);
}

export function parsePoolTokens(tokens: any) {
  return parsePoolTokensValue(tokens);
}
