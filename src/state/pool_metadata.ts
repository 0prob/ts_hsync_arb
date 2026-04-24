import { parsePoolMetadataValue } from "../util/pool_record.ts";

export function metadataWithTokenDecimals(pool: any, tokens: string[], tokenDecimals?: Map<string, number> | null) {
  const metadata = parsePoolMetadataValue(pool?.metadata);
  if (!Array.isArray(tokens) || tokens.length === 0 || !tokenDecimals || tokenDecimals.size === 0) {
    return metadata;
  }

  const tokenDecimalsByAddress: Record<string, number> = {};
  const orderedDecimals: number[] = [];
  for (const token of tokens) {
    const key = String(token).toLowerCase();
    const decimals = tokenDecimals.get(key);
    if (decimals == null) continue;
    tokenDecimalsByAddress[key] = decimals;
    orderedDecimals.push(decimals);
  }

  if (orderedDecimals.length !== tokens.length) return metadata;
  return {
    ...metadata,
    tokenDecimals: orderedDecimals,
    tokenDecimalsByAddress,
  };
}

export function metadataWithRegistryTokenDecimals(registry: any, pool: any, tokens: string[]) {
  const tokenDecimals = registry?.getTokenDecimals?.(tokens) ?? null;
  return metadataWithTokenDecimals(pool, tokens, tokenDecimals);
}
