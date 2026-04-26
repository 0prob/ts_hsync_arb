import { normalizeEvmAddress } from "../util/pool_record.ts";

export type PoolsChangedEvent = {
  type: "pools_changed";
  changedPools: Set<string>;
};

export type ReorgDetectedEvent = {
  type: "reorg_detected";
  reorgBlock: number;
  changedPools: Set<string>;
};

export type PoolsDiscoveredEvent = {
  type: "pools_discovered";
  pools: any[];
};

export type WatcherHaltEvent = {
  type: "watcher_halt";
  payload: Record<string, unknown>;
};

export type RuntimeEvent =
  | PoolsChangedEvent
  | ReorgDetectedEvent
  | PoolsDiscoveredEvent
  | WatcherHaltEvent;

function normalizePoolAddressLike(value: unknown) {
  return normalizeEvmAddress(value);
}

export function normalizeChangedPools(value: unknown): Set<string> {
  if (value == null) return new Set();

  if (typeof value === "string") {
    const normalized = normalizePoolAddressLike(value);
    return normalized ? new Set([normalized]) : new Set();
  }

  if (value instanceof Set || Array.isArray(value)) {
    return new Set(
      [...value]
        .map(normalizePoolAddressLike)
        .filter((entry): entry is string => entry != null),
    );
  }

  if (typeof (value as { [Symbol.iterator]?: unknown })?.[Symbol.iterator] === "function") {
    return new Set(
      [...value as Iterable<unknown>]
        .map(normalizePoolAddressLike)
        .filter((entry): entry is string => entry != null),
    );
  }

  return new Set();
}

export function normalizeReorgBlock(value: unknown) {
  const numeric = Number(value);
  if (!Number.isSafeInteger(numeric) || numeric < 0) return null;
  return numeric;
}

export function normalizeEventPayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}
