import { render } from 'ink';
import { App } from './App.tsx';

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

/**
 * Start the Ink TUI. Polls the shared botState object every 250 ms and
 * rerenders — the hot path never calls into this module.
 */
export function startTui(state: BotState): () => void {
  const instance = render(<App state={state} />);
  const timer = setInterval(() => instance.rerender(<App state={state} />), 250);
  const stop = () => clearInterval(timer);
  void instance.waitUntilExit().finally(stop);
  return () => {
    stop();
    instance.unmount();
  };
}
