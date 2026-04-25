import { selectOptimizationCandidates, shouldOptimizeCandidate } from "./optimization_candidates.ts";

type CandidatePathLike = {
  startToken: string;
  hopCount: number;
  edges: Array<{
    poolAddress: string;
    tokenIn: string;
    tokenOut: string;
    protocol: string;
    zeroForOne?: boolean;
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

type CandidateAssessmentSummary = {
  shortlisted: number;
  assessed: number;
  missingTokenRates: number;
  optimizedCandidates: number;
  secondChanceOptimized: number;
  profitable: number;
  rejected: number;
  rejectReasons: Record<string, number>;
};

function recordAssessmentReject(summary: CandidateAssessmentSummary, reason: string | undefined) {
  summary.rejected++;
  const key = reason && reason.trim() ? reason : "assessment_rejected";
  summary.rejectReasons[key] = (summary.rejectReasons[key] ?? 0) + 1;
}

export async function evaluateCandidatePipeline<TAssessment, TCandidate extends CandidateEntryLike>(
  candidates: TCandidate[],
  options: {
    shortlistLimit: number;
    gasPriceWei: bigint;
    getTokenToMaticRate: (tokenAddress: string) => bigint;
    optimizePath: (
      path: TCandidate["path"],
      quickResult: TCandidate["result"],
      tokenToMaticRate: bigint,
    ) => Promise<TCandidate["result"] | null> | TCandidate["result"] | null;
    assessRoute: (
      path: TCandidate["path"],
      routeResult: TCandidate["result"],
      tokenToMaticRate: bigint,
    ) => TAssessment & { shouldExecute: boolean };
  },
) {
  const shortlisted = selectOptimizationCandidates(candidates, options.shortlistLimit, {
    gasPriceWei: options.gasPriceWei,
    getTokenToMaticRate: options.getTokenToMaticRate,
  });
  const bestQuickProfit = shortlisted[0]?.result?.profit ?? 0n;
  const profitable: Array<TCandidate & { assessment: TAssessment & { shouldExecute: boolean } }> = [];
  let optimizedCandidates = 0;
  const assessmentSummary: CandidateAssessmentSummary = {
    shortlisted: shortlisted.length,
    assessed: 0,
    missingTokenRates: 0,
    optimizedCandidates: 0,
    secondChanceOptimized: 0,
    profitable: 0,
    rejected: 0,
    rejectReasons: {},
  };

  for (let i = 0; i < shortlisted.length; i++) {
    const { path, result: quickResult } = shortlisted[i];
    const tokenToMaticRate = options.getTokenToMaticRate(path.startToken);
    if (tokenToMaticRate <= 0n) {
      assessmentSummary.missingTokenRates++;
      continue;
    }

    let evaluatedResult = quickResult;
    let optimized = false;
    if (shouldOptimizeCandidate(shortlisted[i], i, shortlisted.length, bestQuickProfit)) {
      optimizedCandidates++;
      assessmentSummary.optimizedCandidates++;
      optimized = true;
      evaluatedResult = await options.optimizePath(path, quickResult, tokenToMaticRate) ?? quickResult;
    }

    let assessment = options.assessRoute(path, evaluatedResult, tokenToMaticRate);
    assessmentSummary.assessed++;
    if (!assessment.shouldExecute && !optimized && quickResult.profit > 0n) {
      const secondChanceResult = await options.optimizePath(path, quickResult, tokenToMaticRate);
      if (secondChanceResult) {
        optimizedCandidates++;
        assessmentSummary.optimizedCandidates++;
        assessmentSummary.secondChanceOptimized++;
        evaluatedResult = secondChanceResult;
        assessment = options.assessRoute(path, evaluatedResult, tokenToMaticRate);
      }
    }
    if (assessment.shouldExecute) {
      profitable.push({ ...shortlisted[i], result: evaluatedResult, assessment });
      assessmentSummary.profitable++;
    } else {
      recordAssessmentReject(
        assessmentSummary,
        "rejectReason" in assessment && typeof assessment.rejectReason === "string"
          ? assessment.rejectReason
          : undefined,
      );
    }
  }

  return {
    shortlisted,
    bestQuickProfit,
    optimizedCandidates,
    profitable,
    assessmentSummary,
  };
}
