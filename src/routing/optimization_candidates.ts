import { routeKeyFromEdges } from "./finder.ts";
import { scoreRoute } from "./score_route.ts";
import { toFiniteNumber as normaliseLogWeight } from "../util/bigint.ts";

type CandidatePathLike = {
  startToken: string;
  hopCount: number;
  edges: Array<{
    poolAddress: string;
    tokenIn: string;
    tokenOut: string;
    protocol: string;
  }>;
  logWeight: unknown;
};

type CandidateResultLike = {
  amountIn: bigint;
  amountOut: bigint;
  profit: bigint;
  profitable?: boolean;
  totalGas: number;
};

type CandidateEntryLike = {
  path: CandidatePathLike;
  result: CandidateResultLike;
};

function normalizeCandidateLimit(limit: number) {
  if (!Number.isFinite(limit) || limit <= 0) return 0;
  return Math.floor(limit);
}

function compareCandidateProfit(a: CandidateEntryLike, b: CandidateEntryLike) {
  if (b.result.profit > a.result.profit) return 1;
  if (b.result.profit < a.result.profit) return -1;
  return 0;
}

function isViableQuickCandidate(entry: CandidateEntryLike) {
  return entry?.result?.profit > 0n;
}

function scoreForCandidate(
  entry: CandidateEntryLike,
  options: {
    gasPriceWei: bigint;
    getTokenToMaticRate: (tokenAddress: string) => bigint;
  },
  caches: {
    tokenRates: Map<string, bigint>;
    scored: WeakMap<CandidateEntryLike, ReturnType<typeof scoreRoute> | null>;
  },
) {
  const cachedScore = caches.scored.get(entry);
  if (cachedScore !== undefined) return cachedScore;

  const tokenKey = entry.path.startToken.toLowerCase();
  let tokenToMaticRate = caches.tokenRates.get(tokenKey);
  if (tokenToMaticRate == null) {
    tokenToMaticRate = options.getTokenToMaticRate(entry.path.startToken);
    caches.tokenRates.set(tokenKey, tokenToMaticRate);
  }

  const scored = scoreRoute(entry.path as any, entry.result as any, {
    gasPriceWei: options.gasPriceWei,
    tokenToMaticRate: tokenToMaticRate > 0n ? tokenToMaticRate : null,
  });
  caches.scored.set(entry, scored);
  return scored;
}

export function selectOptimizationCandidates<T extends CandidateEntryLike>(
  candidates: T[],
  limit: number,
  options: {
    gasPriceWei: bigint;
    getTokenToMaticRate: (tokenAddress: string) => bigint;
  },
) {
  const normalizedLimit = normalizeCandidateLimit(limit);
  if (normalizedLimit === 0 || candidates.length === 0) return [];
  const viableCandidates = candidates.filter(isViableQuickCandidate);
  if (viableCandidates.length === 0) return [];

  const scoreCaches = {
    tokenRates: new Map<string, bigint>(),
    scored: new WeakMap<CandidateEntryLike, ReturnType<typeof scoreRoute> | null>(),
  };
  const selected = new Map<string, T>();
  const fallbackKeys = new WeakMap<CandidateEntryLike, string>();
  let fallbackKeyId = 0;
  const selectionKeyFor = (entry: T) => {
    try {
      return routeKeyFromEdges(entry.path.startToken, entry.path.edges);
    } catch {
      let fallbackKey = fallbackKeys.get(entry);
      if (!fallbackKey) {
        fallbackKey = `candidate:${++fallbackKeyId}`;
        fallbackKeys.set(entry, fallbackKey);
      }
      return fallbackKey;
    }
  };
  const addBatch = (batch: T[]) => {
    for (const entry of batch) {
      const key = selectionKeyFor(entry);
      if (!selected.has(key)) {
        selected.set(key, entry);
        if (selected.size >= normalizedLimit) break;
      }
    }
  };

  const topByProfit = [...viableCandidates].sort(compareCandidateProfit);
  const topByRoi = [...viableCandidates].sort((a, b) => {
    const scoredA = scoreForCandidate(a, options, scoreCaches);
    const scoredB = scoreForCandidate(b, options, scoreCaches);
    return (scoredB?.roi ?? -Infinity) - (scoredA?.roi ?? -Infinity);
  });
  const topByScore = [...viableCandidates].sort((a, b) => {
    const scoredA = scoreForCandidate(a, options, scoreCaches);
    const scoredB = scoreForCandidate(b, options, scoreCaches);
    return (scoredB?.score ?? -Infinity) - (scoredA?.score ?? -Infinity);
  });
  const topByLogWeight = [...viableCandidates].sort(
    (a, b) => normaliseLogWeight(a.path.logWeight) - normaliseLogWeight(b.path.logWeight)
  );

  addBatch(topByProfit.slice(0, Math.ceil(normalizedLimit * 0.4)));
  addBatch(topByScore.slice(0, Math.ceil(normalizedLimit * 0.3)));
  addBatch(topByRoi.slice(0, Math.ceil(normalizedLimit * 0.2)));
  addBatch(topByLogWeight.slice(0, Math.ceil(normalizedLimit * 0.1)));
  addBatch(topByProfit);

  return [...selected.values()]
    .sort(compareCandidateProfit)
    .slice(0, normalizedLimit);
}

export function shouldOptimizeCandidate(
  entry: { result?: { profit?: bigint | null } | null } | null | undefined,
  index: number,
  total: number,
  bestQuickProfit: bigint,
) {
  const quickProfit = entry?.result?.profit ?? 0n;
  if (quickProfit <= 0n) return false;

  if (index < 3) return true;
  if (index < Math.ceil(total * 0.4)) return true;
  if (bestQuickProfit <= 0n) return index < Math.ceil(total * 0.5);

  // Preserve optimization for candidates whose quick pass is close to the best.
  return quickProfit * 100n >= bestQuickProfit * 25n;
}
