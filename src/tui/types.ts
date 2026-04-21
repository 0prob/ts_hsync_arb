export interface BotOpportunityRow {
  Route: string;
  Profit: string;
  ROI: string;
}

export interface BotState {
  status: 'idle' | 'running' | 'error';
  passCount: number;
  consecutiveErrors: number;
  gasPrice: string;
  maticPrice: string;
  lastArbMs: number;
  opportunities: BotOpportunityRow[];
  logs: string[];
}
