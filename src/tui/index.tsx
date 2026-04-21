import type { BotState } from './types.ts';

function formatOpportunities(state: BotState): string[] {
  if (state.opportunities.length === 0) {
    return ['No opportunities found yet...'];
  }

  return state.opportunities.slice(0, 5).map((opportunity: any, index) => {
    const route = Array.isArray(opportunity?.route) ? opportunity.route.join(' -> ') : 'n/a';
    const profit = opportunity?.netProfitUsd ?? opportunity?.profitUsd ?? opportunity?.profit ?? 'n/a';
    return `${String(index + 1).padStart(2, ' ')}. ${route} | profit: ${profit}`;
  });
}

function renderFrame(state: BotState): string {
  const header = [
    '╔══════════════════════════════════════════════════════════════╗',
    '║ Polygon Arbitrage Bot — Live TUI                           ║',
    '╚══════════════════════════════════════════════════════════════╝',
    `Status: ${state.status.toUpperCase()}    Passes: ${state.passCount}    Errors: ${state.consecutiveErrors}`,
    `Gas: ${state.gasPrice} Gwei    MATIC: $${state.maticPrice}`,
    '',
    'Recent Opportunities',
    ...formatOpportunities(state),
    '',
    'Recent Logs',
    ...(state.logs.length > 0 ? state.logs.slice(0, 10) : ['No logs yet...']),
    '',
    "Press 'q' to exit",
  ];

  return `\u001Bc${header.join('\n')}`;
}

/**
 * Start a simple ANSI TUI. Polls the shared botState object every 250 ms and
 * redraws stdout; the hot path never calls into this module.
 */
export function startTui(state: BotState): () => void {
  const stdin = process.stdin;
  const stdout = process.stdout;
  let timer: NodeJS.Timeout | null = null;

  const draw = () => {
    if (stdout.isTTY) {
      stdout.write(renderFrame(state));
    }
  };

  const onData = (chunk: Buffer | string) => {
    if (String(chunk).includes('q')) {
      stop();
      process.kill(process.pid, 'SIGINT');
    }
  };

  const stop = () => {
    if (timer) clearInterval(timer);
    stdin.off('data', onData);
    if (stdin.isTTY) {
      stdin.setRawMode(false);
    }
  };

  if (stdin.isTTY) {
    stdin.setRawMode(true);
  }
  stdin.resume();
  stdin.on('data', onData);
  draw();
  timer = setInterval(draw, 250);

  return () => {
    stop();
    if (stdout.isTTY) {
      stdout.write('\u001B[?25h');
    }
  };
}
