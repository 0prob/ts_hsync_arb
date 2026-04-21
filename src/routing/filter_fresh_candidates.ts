type FreshnessLike = {
  ok: boolean;
  reason?: string;
  ageMs?: number;
  skewMs?: number;
};

type CandidateLike<TPath> = {
  path: TPath;
};

export function partitionFreshCandidates<TPath, TCandidate extends CandidateLike<TPath>>(
  candidates: TCandidate[],
  getFreshness: (path: TPath) => FreshnessLike,
) {
  const fresh: TCandidate[] = [];
  const stale: Array<{ candidate: TCandidate; freshness: FreshnessLike }> = [];

  for (const candidate of candidates) {
    const freshness = getFreshness(candidate.path);
    if (freshness.ok) {
      fresh.push(candidate);
      continue;
    }
    stale.push({ candidate, freshness });
  }

  return { fresh, stale };
}
