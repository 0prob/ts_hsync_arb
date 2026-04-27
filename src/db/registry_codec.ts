
/**
 * src/db/registry_codec.js — Shared JSON/row conversion helpers for RegistryService
 */

import { normalizeEvmAddress } from "../util/pool_record.ts";
import {
  isBalancerProtocol,
  isCurveProtocol,
  isDodoProtocol,
  isWoofiProtocol,
  isV2Protocol,
  isV3Protocol,
  normalizeProtocolKey,
} from "../protocols/classification.ts";

const BIGINT_SCALAR_FIELDS: Record<string, string[]> = {
  V2:      ["fee", "reserve0", "reserve1"],
  V3:      ["fee", "sqrtPriceX96", "liquidity"],
  CURVE:   ["fee", "A", "swapFee"],
  BALANCER:["swapFee", "amp", "ampPrecision"],
  DODO:    ["fee", "baseReserve", "quoteReserve", "baseTarget", "quoteTarget", "i", "k", "lpFeeRate", "mtFeeRate"],
  WOOFI:   ["fee", "feeDenominator", "quoteReserve", "quoteFeeRate", "quoteDec"],
};

const BIGINT_ARRAY_FIELDS: Record<string, string[]> = {
  CURVE:   ["balances", "rates"],
  BALANCER:["balances", "weights", "scalingFactors"],
  WOOFI:   ["balances"],
};

function protocolClass(protocol: string): string {
  const protocolKey = normalizeProtocolKey(protocol);
  if (isV2Protocol(protocolKey)) return "V2";
  if (isV3Protocol(protocolKey)) return "V3";
  if (isCurveProtocol(protocolKey)) return "CURVE";
  if (isBalancerProtocol(protocolKey)) return "BALANCER";
  if (isDodoProtocol(protocolKey)) return "DODO";
  if (isWoofiProtocol(protocolKey)) return "WOOFI";
  return "";
}

function toBigIntSafe(v: any): bigint | any {
  if (v == null || typeof v === "bigint") return v;
  try { return BigInt(v); } catch { return v; }
}

function toBigIntOrZero(v: any): bigint {
  if (typeof v === "bigint") return v;
  try { return BigInt(v ?? 0); } catch { return 0n; }
}

export function normalizeAddress(value: any) {
  return typeof value === "string" ? value.trim().toLowerCase() : value;
}

function normalizeAddressList(values: any) {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => normalizeEvmAddress(value))
    .filter((value): value is string => value != null);
}

function tickEntriesFrom(value: any): Array<[unknown, any]> {
  if (!value) return [];
  if (value instanceof Map) return [...value.entries()];
  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (Array.isArray(entry) && entry.length >= 2) return [entry[0], entry[1]] as [unknown, any];
        if (entry && typeof entry === "object" && ("tick" in entry || "index" in entry)) {
          return [entry.tick ?? entry.index, entry] as [unknown, any];
        }
        return null;
      })
      .filter((entry): entry is [unknown, any] => entry != null);
  }
  if (typeof value === "object") return Object.entries(value);
  return [];
}

export function rehydrateV3Ticks(ticks: any) {
  const entries: Array<[number, { liquidityGross: bigint; liquidityNet: bigint }]> = [];
  for (const [tick, liquidity] of tickEntriesFrom(ticks)) {
    const tickNumber = Number(tick);
    if (!Number.isInteger(tickNumber)) continue;
    entries.push([tickNumber, {
      liquidityGross: toBigIntOrZero(liquidity?.liquidityGross),
      liquidityNet: toBigIntOrZero(liquidity?.liquidityNet),
    }]);
  }
  entries.sort(([a], [b]) => a - b);
  return new Map(entries);
}

function rehydrateV3State(data: any) {
  if (!data?.ticks) return;
  data.ticks = rehydrateV3Ticks(data.ticks);
}

function rehydrateWoofiState(data: any) {
  if (!data?.baseTokenStates || typeof data.baseTokenStates !== "object") return;
  for (const state of Object.values(data.baseTokenStates) as any[]) {
    for (const field of [
      "reserve",
      "feeRate",
      "maxGamma",
      "maxNotionalSwap",
      "price",
      "spread",
      "coeff",
      "baseDec",
      "quoteDec",
      "priceDec",
    ]) {
      if (state?.[field] != null) state[field] = toBigIntSafe(state[field]);
    }
  }
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
  if (cls === "V3") {
    rehydrateV3State(data);
  } else if (cls === "WOOFI") {
    rehydrateWoofiState(data);
  }
  return data;
}

export function stringifyWithBigInt(obj: any) {
  return JSON.stringify(obj, (_key, value) =>
    typeof value === "bigint"
      ? value.toString()
      : value instanceof Map
        ? Object.fromEntries(value)
        : value
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
  return normalizeAddressList(values);
}

export function mapPoolRow(row: any) {
  return {
    pool_address: normalizeAddress(row.address),
    protocol: row.protocol,
    tokens: normalizeAddressList(parseJson(row.tokens, [])),
    block: row.created_block,
    tx: row.created_tx,
    metadata: parseJson(row.metadata, {}),
    status: row.status || "active",
    removed_block: row.removed_block ?? null,
    state: row.state_data
      ? { block: row.last_updated_block, data: rehydrateStateData(row.protocol, parseJson(row.state_data, null)) }
      : null,
  };
}

export function mapPoolMetaRow(row: any) {
  return {
    pool_address: normalizeAddress(row.address),
    protocol: row.protocol,
    tokens: normalizeAddressList(parseJson(row.tokens, [])),
    block: row.created_block,
    tx: row.created_tx,
    metadata: parseJson(row.metadata, {}),
    status: row.status || "active",
    removed_block: row.removed_block ?? null,
    state: null,
  };
}

export function mapStalePoolRow(row: any) {
  return {
    pool_address: normalizeAddress(row.address),
    protocol: row.protocol,
    tokens: normalizeAddressList(parseJson(row.tokens, [])),
    metadata: parseJson(row.metadata, {}),
  };
}

export function mapArbHistoryRow(row: any) {
  return {
    ...row,
    tx_hash: normalizeAddress(row.tx_hash),
    start_token: normalizeAddress(row.start_token),
    pools: normalizeAddressList(parseJson(row.pools, [])),
    protocols: parseJson(row.protocols, []),
  };
}
