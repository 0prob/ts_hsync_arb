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

function roiForCandidate(result: CandidateResultLike | null | undefined) {
  if (!result?.amountIn || result.amountIn <= 0n) return -Infinity;
  return Number((result.profit * 1_000_000n) / result.amountIn);
}

export function selectOptimizationCandidates<T extends CandidateEntryLike>(
  candidates: T[],
  limit: number,
  options: {
    gasPriceWei: bigint;
    getTokenToMaticRate: (tokenAddress: string) => bigint;
  },
) {
  if (candidates.length <= limit) return candidates;

  const selected = new Map<string, T>();
  const addBatch = (batch: T[]) => {
    for (const entry of batch) {
      const key = routeKeyFromEdges(entry.path.startToken, entry.path.edges);
      if (!selected.has(key)) {
        selected.set(key, entry);
        if (selected.size >= limit) break;
      }
    }
  };

  const topByProfit = [...candidates];
  const topByRoi = [...candidates].sort((a, b) => roiForCandidate(b.result) - roiForCandidate(a.result));
  const topByScore = [...candidates].sort((a, b) => {
    const rateA = options.getTokenToMaticRate(a.path.startToken);
    const rateB = options.getTokenToMaticRate(b.path.startToken);
    const scoredA = scoreRoute(a.path as any, a.result as any, {
      gasPriceWei: options.gasPriceWei,
      tokenToMaticRate: rateA > 0n ? rateA : null,
    });
    const scoredB = scoreRoute(b.path as any, b.result as any, {
      gasPriceWei: options.gasPriceWei,
      tokenToMaticRate: rateB > 0n ? rateB : null,
    });
    return (scoredB?.score ?? -Infinity) - (scoredA?.score ?? -Infinity);
  });
  const topByLogWeight = [...candidates].sort(
    (a, b) => normaliseLogWeight(a.path.logWeight) - normaliseLogWeight(b.path.logWeight)
  );

  addBatch(topByProfit.slice(0, Math.ceil(limit * 0.4)));
  addBatch(topByScore.slice(0, Math.ceil(limit * 0.3)));
  addBatch(topByRoi.slice(0, Math.ceil(limit * 0.2)));
  addBatch(topByLogWeight.slice(0, Math.ceil(limit * 0.1)));
  addBatch(topByProfit);

  return [...selected.values()].slice(0, limit);
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
