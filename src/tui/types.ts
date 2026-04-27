export interface BotOpportunityRow {
  Route: string;
  Profit: string;
  ROI: string;
}

export interface BotState {
  status: 'idle' | 'running' | 'error';
  mode: string;
  passCount: number;
  consecutiveErrors: number;
  gasPrice: string;
  lastArbMs: number;
  stateCacheSize?: number;
  cachedPathCount?: number;
  lastPassDurationMs?: number;
  lastOpportunityCount?: number;
  lastPathsEvaluated?: number;
  lastCandidateCount?: number;
  lastShortlistCount?: number;
  lastOptimizedCount?: number;
  lastProfitableCount?: number;
  lastUpdateMs?: number;
  opportunities: BotOpportunityRow[];
  logs: string[];
}
