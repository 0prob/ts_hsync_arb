
/**
 * src/db/registry_codec.js — Shared JSON/row conversion helpers for RegistryService
 */

const BIGINT_SCALAR_FIELDS: Record<string, string[]> = {
  V2:      ["fee", "reserve0", "reserve1"],
  V3:      ["fee", "sqrtPriceX96", "liquidity"],
  CURVE:   ["fee", "A", "swapFee"],
  BALANCER:["swapFee"],
};

const BIGINT_ARRAY_FIELDS: Record<string, string[]> = {
  CURVE:   ["balances", "rates"],
  BALANCER:["balances", "weights"],
};

function protocolClass(protocol: string): string {
  if (!protocol) return "";
  if (protocol.includes("_V2")) return "V2";
  if (protocol.includes("_V3")) return "V3";
  if (protocol.startsWith("CURVE")) return "CURVE";
  if (protocol.startsWith("BALANCER")) return "BALANCER";
  return "";
}

function toBigIntSafe(v: any): bigint | any {
  if (v == null || typeof v === "bigint") return v;
  try { return BigInt(v); } catch { return v; }
}

export function rehydrateStateData(protocol: string, data: any): any {
  if (!data) return data;
  const cls = protocolClass(protocol);
  for (const field of BIGINT_SCALAR_FIELDS[cls] || []) {
    if (data[field] != null) data[field] = toBigIntSafe(data[field]);
  }
  for (const field of BIGINT_ARRAY_FIELDS[cls] || []) {
    if (Array.isArray(data[field])) {
      data[field] = data[field].map(toBigIntSafe);
    }
  }
  return data;
}

export function stringifyWithBigInt(obj: any) {
  return JSON.stringify(obj, (_key, value) =>
    typeof value === "bigint" ? value.toString() : value
  );
}

export function parseJson(value: any, fallback: any) {
  if (value == null) return fallback;
  if (typeof value !== "string") return value;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function lowerCaseAddressList(values: any[] = []) {
  return values.map((value) =>
    typeof value === "string" ? value.toLowerCase() : value
  );
}

export function mapPoolRow(row: any) {
  return {
    pool_address: row.address,
    protocol: row.protocol,
    tokens: parseJson(row.tokens, []),
    block: row.created_block,
    tx: row.created_tx,
    metadata: parseJson(row.metadata, {}),
    status: row.status || "active",
    state: row.state_data
      ? { block: row.last_updated_block, data: rehydrateStateData(row.protocol, parseJson(row.state_data, null)) }
      : null,
  };
}

export function mapPoolMetaRow(row: any) {
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

export function mapStalePoolRow(row: any) {
  return {
    pool_address: row.address,
    protocol: row.protocol,
    tokens: parseJson(row.tokens, []),
    metadata: parseJson(row.metadata, {}),
  };
}

export function mapArbHistoryRow(row: any) {
  return {
    ...row,
    pools: parseJson(row.pools, []),
    protocols: parseJson(row.protocols, []),
  };
}
