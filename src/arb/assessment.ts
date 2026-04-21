import { computeProfit } from "../profit/compute.ts";

export type RouteResultLike = {
  amountIn: bigint;
  amountOut: bigint;
  profit: bigint;
  profitable?: boolean;
  totalGas: number;
  poolPath?: string[];
  tokenPath?: string[];
  hopAmounts?: bigint[];
};

export type AssessmentLike = {
  shouldExecute: boolean;
  netProfit: bigint;
  netProfitAfterGas: bigint;
  roi?: number;
  rejectReason?: string;
};

export type ArbPathLike = {
  startToken: string;
  edges: Array<{
    poolAddress: string;
    tokenIn: string;
    tokenOut: string;
    protocol: string;
    zeroForOne: boolean;
  }>;
  hopCount: number;
  logWeight: unknown;
  cumulativeFeesBps?: number;
};

export type CandidateEntry = {
  path: ArbPathLike;
  result: RouteResultLike;
  assessment?: AssessmentLike;
};

export type ExecutableCandidate = CandidateEntry & { assessment: AssessmentLike };

type AssessmentConfig = {
  minProfitWei: bigint;
  slippageBps?: bigint;
  revertRiskBps?: bigint;
};

const MIN_PROBE_AMOUNT = 1_000n;

export function minProfitInTokenUnits(tokenToMaticRate: bigint, minProfitWei: bigint) {
  if (tokenToMaticRate <= 0n) return 0n;
  return (minProfitWei + tokenToMaticRate - 1n) / tokenToMaticRate;
}

export function getOptimizationOptions(quickResult: RouteResultLike | null | undefined) {
  const amountIn = quickResult?.amountIn ?? 10n ** 18n;
  const minAmount = amountIn > 10n ? amountIn / 10n : MIN_PROBE_AMOUNT;
  const maxAmount = amountIn * 8n > minAmount ? amountIn * 8n : minAmount * 8n;
  return {
    minAmount: minAmount > MIN_PROBE_AMOUNT ? minAmount : MIN_PROBE_AMOUNT,
    maxAmount,
    iterations: 24,
  };
}

export function assessRouteResult(
  path: ArbPathLike,
  routeResult: RouteResultLike,
  gasPriceWei: bigint,
  tokenToMaticRate: bigint,
  config: AssessmentConfig,
) {
  return computeProfit(routeResult, {
    gasPriceWei,
    tokenToMaticRate,
    slippageBps: config.slippageBps ?? 50n,
    revertRiskBps: config.revertRiskBps ?? 500n,
    minNetProfit: minProfitInTokenUnits(tokenToMaticRate, config.minProfitWei),
    hopCount: path.hopCount,
  });
}

export function getAssessmentOptimizationOptions(
  path: ArbPathLike,
  quickResult: RouteResultLike | null | undefined,
  gasPriceWei: bigint,
  tokenToMaticRate: bigint,
  config: AssessmentConfig,
) {
  return {
    ...getOptimizationOptions(quickResult),
    scorer: (routeResult: RouteResultLike) =>
      assessRouteResult(path, routeResult, gasPriceWei, tokenToMaticRate, config).netProfitAfterGas,
    accept: (routeResult: RouteResultLike) =>
      assessRouteResult(path, routeResult, gasPriceWei, tokenToMaticRate, config).shouldExecute,
  };
}

export function profitMarginBps(candidate: ExecutableCandidate) {
  if (!candidate?.result?.amountIn || candidate.result.amountIn <= 0n) return 0n;
  const netProfit = candidate.assessment?.netProfitAfterGas ?? candidate.assessment?.netProfit ?? 0n;
  if (netProfit <= 0n) return 0n;
  return (netProfit * 10_000n) / candidate.result.amountIn;
}

export function assessmentNetProfit(assessment: AssessmentLike | null | undefined) {
  if (assessment?.netProfitAfterGas != null) return assessment.netProfitAfterGas;
  return assessment?.netProfit ?? 0n;
}

export function compareAssessmentProfit(a: CandidateEntry, b: CandidateEntry) {
  const profitA = assessmentNetProfit(a?.assessment);
  const profitB = assessmentNetProfit(b?.assessment);
  if (profitB > profitA) return 1;
  if (profitB < profitA) return -1;
  return 0;
}
