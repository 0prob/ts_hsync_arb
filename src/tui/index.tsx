import type { BotOpportunityRow, BotState } from './types.ts';

const ESC = '\u001b[';
const RESET = `${ESC}0m`;
const DIM = `${ESC}2m`;
const BOLD = `${ESC}1m`;
const CYAN = `${ESC}36m`;
const GREEN = `${ESC}32m`;
const YELLOW = `${ESC}33m`;
const RED = `${ESC}31m`;
const BLUE = `${ESC}34m`;
const MAGENTA = `${ESC}35m`;
const WHITE = `${ESC}37m`;
const SPINNER_FRAMES = ['-', '\\', '|', '/'];
const MAX_OPPORTUNITIES = 5;
const MAX_LOGS = 8;
const MIN_WIDTH = 72;
const MAX_WIDTH = 120;
const POLL_INTERVAL_MS = 250;
const SPINNER_INTERVAL_MS = 500;

function colorize(value: string, color: string) {
  return `${color}${value}${RESET}`;
}

function stripAnsi(value: string) {
  return value.replace(/\u001b\[[0-9;]*m/g, '');
}

function truncate(value: string, width: number) {
  if (width <= 0) return '';
  const plain = stripAnsi(value);
  if (plain.length <= width) return value;
  if (width === 1) return '…';
  return `${plain.slice(0, Math.max(0, width - 1))}…`;
}

function pad(value: string, width: number) {
  const plain = stripAnsi(value);
  if (plain.length >= width) return truncate(value, width);
  return `${value}${' '.repeat(width - plain.length)}`;
}

function formatStatus(state: BotState, spinnerFrame: string) {
  if (state.status === 'running') return colorize(`${spinnerFrame} RUNNING`, GREEN);
  if (state.status === 'error') return colorize('ERROR', RED);
  return colorize('IDLE', YELLOW);
}

function normalizeOpportunity(opportunity: BotOpportunityRow, index: number, width: number) {
  const prefix = colorize(`${String(index + 1).padStart(2, '0')}.`, CYAN);
  const routeWidth = Math.max(18, width - 30);
  const route = truncate(opportunity.Route || 'n/a', routeWidth);
  const profit = truncate(opportunity.Profit || 'n/a', 14);
  const roi = truncate(opportunity.ROI || 'n/a', 10);
  return `${prefix} ${pad(route, routeWidth)} ${colorize('profit', DIM)} ${pad(profit, 14)} ${colorize('roi', DIM)} ${roi}`;
}

function summarizeLogLevel(line: string) {
  if (line.includes('[ERROR]')) return RED;
  if (line.includes('[WARN]')) return YELLOW;
  if (line.includes('[DEBUG]')) return BLUE;
  return WHITE;
}

function formatLogs(state: BotState, width: number) {
  const logs = state.logs.slice(0, MAX_LOGS);
  if (logs.length === 0) {
    return [colorize('No logs yet...', DIM)];
  }

  return logs.map((line) => colorize(truncate(line.replace(/\s+/g, ' ').trim(), width), summarizeLogLevel(line)));
}

function section(title: string, width: number, color: string) {
  const label = ` ${title.toUpperCase()} `;
  const ruleWidth = Math.max(0, width - label.length);
  return `${colorize(label, color)}${colorize('─'.repeat(ruleWidth), DIM)}`;
}

function renderFrame(state: BotState, columns: number, spinnerFrame: string): string {
  const width = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, columns || MIN_WIDTH));
  const innerWidth = width - 4;
  const top = `┌${'─'.repeat(width - 2)}┐`;
  const bottom = `└${'─'.repeat(width - 2)}┘`;
  const title = pad(`${BOLD}Polygon Arbitrage Bot${RESET}`, innerWidth);
  const subtitle = pad(`${DIM}live monitor${RESET}`, innerWidth);
  const stats = [
    `${colorize('status', DIM)} ${formatStatus(state, spinnerFrame)}`,
    `${colorize('passes', DIM)} ${state.passCount}`,
    `${colorize('errors', DIM)} ${state.consecutiveErrors}`,
    `${colorize('gas', DIM)} ${state.gasPrice} gwei`,
    `${colorize('matic', DIM)} $${state.maticPrice}`,
  ].join(` ${colorize('•', DIM)} `);

  const lines = [
    top,
    `│ ${pad(title, innerWidth)} │`,
    `│ ${pad(subtitle, innerWidth)} │`,
    `│ ${pad('', innerWidth)} │`,
    `│ ${pad(truncate(stats, innerWidth), innerWidth)} │`,
    `│ ${pad('', innerWidth)} │`,
    `│ ${pad(section('Top opportunities', innerWidth, MAGENTA), innerWidth)} │`,
  ];

  const opportunities = state.opportunities.slice(0, MAX_OPPORTUNITIES);
  if (opportunities.length === 0) {
    lines.push(`│ ${pad(colorize('No opportunities found yet...', DIM), innerWidth)} │`);
  } else {
    for (let index = 0; index < opportunities.length; index += 1) {
      lines.push(`│ ${pad(normalizeOpportunity(opportunities[index], index, innerWidth), innerWidth)} │`);
    }
  }

  lines.push(`│ ${pad('', innerWidth)} │`);
  lines.push(`│ ${pad(section('Recent logs', innerWidth, BLUE), innerWidth)} │`);
  for (const line of formatLogs(state, innerWidth)) {
    lines.push(`│ ${pad(line, innerWidth)} │`);
  }
  lines.push(`│ ${pad('', innerWidth)} │`);
  lines.push(`│ ${pad(`${DIM}Press q or Ctrl+C to exit${RESET}`, innerWidth)} │`);
  lines.push(bottom);

  return `${ESC}?25l${ESC}H${ESC}2J${lines.join('\n')}`;
}

function signatureFor(state: BotState, columns: number) {
  return JSON.stringify({
    columns: Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, columns || MIN_WIDTH)),
    status: state.status,
    passCount: state.passCount,
    consecutiveErrors: state.consecutiveErrors,
    gasPrice: state.gasPrice,
    maticPrice: state.maticPrice,
    opportunities: state.opportunities.slice(0, MAX_OPPORTUNITIES),
    logs: state.logs.slice(0, MAX_LOGS),
  });
}

/**
 * Start a simple ANSI TUI. Polls the shared botState object every 250 ms and
 * redraws stdout only when the rendered state, spinner, or terminal size changes.
 */
export function startTui(state: BotState): () => void {
  const stdin = process.stdin;
  const stdout = process.stdout;
  let timer: NodeJS.Timeout | null = null;
  let stopped = false;
  let spinnerIndex = 0;
  let lastSignature = '';
  let lastSpinnerAt = 0;
  let alternateScreenActive = false;

  const draw = (force = false) => {
    if (!stdout.isTTY || stopped) return;

    const now = Date.now();
    const columns = stdout.columns ?? MIN_WIDTH;
    const signature = signatureFor(state, columns);
    const stateChanged = signature !== lastSignature;
    const spinnerDue = state.status === 'running' && now - lastSpinnerAt >= SPINNER_INTERVAL_MS;
    if (!force && !stateChanged && !spinnerDue) return;

    if (spinnerDue || force) {
      spinnerIndex = (spinnerIndex + 1) % SPINNER_FRAMES.length;
      lastSpinnerAt = now;
    }

    const spinnerFrame = SPINNER_FRAMES[spinnerIndex];

    try {
      stdout.write(renderFrame(state, columns, spinnerFrame));
      lastSignature = signature;
    } catch {
      stop();
    }
  };

  const onData = (chunk: Buffer | string) => {
    const input = String(chunk);
    if (input.includes('\u0003') || input.toLowerCase() === 'q') {
      stop();
      process.kill(process.pid, 'SIGINT');
    }
  };

  const onResize = () => draw(true);

  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (timer) clearInterval(timer);
    stdin.off('data', onData);
    stdout.off('resize', onResize);
    if (stdin.isTTY) {
      stdin.setRawMode(false);
      stdin.pause();
    }
    if (alternateScreenActive && stdout.isTTY) stdout.write(`${ESC}?1049l${ESC}?25h`);
  };

  if (!stdout.isTTY) {
    return () => {};
  }

  stdout.on('error', stop);
  stdout.on('resize', onResize);
  stdout.write(`${ESC}?1049h${ESC}H`);
  alternateScreenActive = true;

  if (stdin.isTTY && typeof stdin.setRawMode === 'function') {
    stdin.setRawMode(true);
  }
  stdin.resume();
  stdin.on('data', onData);
  draw(true);
  timer = setInterval(() => draw(false), POLL_INTERVAL_MS);
  timer.unref?.();

  return () => {
    stop();
    stdout.off('error', stop);
  };
}

export const __tuiTest = {
  formatLogs,
  renderFrame,
  signatureFor,
};
