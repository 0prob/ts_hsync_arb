import { normalizeEvmAddress } from "../util/pool_record.ts";

type PathLike = {
  edges: Array<{
    poolAddress: unknown;
  }>;
};

type StateCacheLike = Map<string, { timestamp?: number } | undefined>;
type FreshnessOptions = { maxAgeMs: number; maxSkewMs: number; nowMs?: number };

function lookupPoolState(poolAddress: unknown, stateCache: StateCacheLike) {
  const normalized = normalizeEvmAddress(poolAddress);
  if (!normalized) return { normalized, state: undefined };

  if (stateCache.has(normalized)) {
    return { normalized, state: stateCache.get(normalized) };
  }

  if (typeof poolAddress === "string" && stateCache.has(poolAddress)) {
    return { normalized, state: stateCache.get(poolAddress) };
  }

  return { normalized, state: undefined };
}

export function getPathFreshness(
  path: PathLike | null | undefined,
  stateCache: StateCacheLike,
  options: FreshnessOptions,
) {
  if (!Array.isArray(path?.edges) || path.edges.length === 0) {
    return { ok: false, reason: "missing route edges" };
  }

  let oldest = Infinity;
  let newest = -Infinity;

  for (const edge of path.edges) {
    const { normalized, state } = lookupPoolState(edge.poolAddress, stateCache);
    if (!normalized) {
      return { ok: false, reason: "invalid pool address" };
    }

    const ts = Number(state?.timestamp ?? NaN);
    if (!Number.isFinite(ts)) {
      return { ok: false, reason: "missing pool timestamp" };
    }
    if (ts < oldest) oldest = ts;
    if (ts > newest) newest = ts;
  }

  const now = Number.isFinite(options.nowMs) ? Number(options.nowMs) : Date.now();
  const ageMs = now - oldest;
  const skewMs = newest - oldest;

  if (ageMs > options.maxAgeMs) {
    return {
      ok: false,
      reason: `route state age ${ageMs}ms > ${options.maxAgeMs}ms`,
      ageMs,
      skewMs,
    };
  }

  if (skewMs > options.maxSkewMs) {
    return {
      ok: false,
      reason: `route state skew ${skewMs}ms > ${options.maxSkewMs}ms`,
      ageMs,
      skewMs,
    };
  }

  return { ok: true, ageMs, skewMs };
}
