type PathLike = {
  hopCount?: number;
  edges?: Array<unknown>;
};

export function getPathHopCount(path: PathLike | null | undefined) {
  if (Array.isArray(path?.edges)) return path.edges.length;

  const hopCount = Number(path?.hopCount);
  if (!Number.isFinite(hopCount) || hopCount <= 0) return 0;
  return hopCount;
}

export function getResultHopCount(result: unknown) {
  const value = result as {
    hopCount?: number;
    poolPath?: Array<unknown>;
    tokenPath?: Array<unknown>;
    hopAmounts?: Array<unknown>;
  } | null | undefined;

  if (Array.isArray(value?.poolPath)) return value.poolPath.length;
  if (Array.isArray(value?.hopAmounts) && value.hopAmounts.length > 0) {
    return value.hopAmounts.length - 1;
  }
  if (Array.isArray(value?.tokenPath) && value.tokenPath.length > 0) {
    return value.tokenPath.length - 1;
  }

  const hopCount = Number(value?.hopCount);
  if (!Number.isFinite(hopCount) || hopCount <= 0) return 0;
  return hopCount;
}
