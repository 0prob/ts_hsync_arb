export interface BotState {
  status: 'idle' | 'running' | 'error';
  passCount: number;
  consecutiveErrors: number;
  gasPrice: string;
  maticPrice: string;
  lastArbMs: number;
  opportunities: any[];
  logs: string[];
}
