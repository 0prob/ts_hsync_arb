type PathLike = {
  edges: Array<{
    poolAddress: string;
  }>;
};

type StateCacheLike = Map<string, { timestamp?: number } | undefined>;

export function getPathFreshness(
  path: PathLike,
  stateCache: StateCacheLike,
  options: { maxAgeMs: number; maxSkewMs: number },
) {
  let oldest = Infinity;
  let newest = -Infinity;

  for (const edge of path.edges) {
    const state = stateCache.get(edge.poolAddress);
    const ts = Number(state?.timestamp ?? NaN);
    if (!Number.isFinite(ts)) {
      return { ok: false, reason: "missing pool timestamp" };
    }
    if (ts < oldest) oldest = ts;
    if (ts > newest) newest = ts;
  }

  const now = Date.now();
  const ageMs = now - newest;
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
