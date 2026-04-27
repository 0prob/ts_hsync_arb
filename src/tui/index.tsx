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
const MAX_STATE_LOGS = 20;
const MAX_CAPTURED_LOG_CHARS = 600;
const MIN_WIDTH = 72;
const MAX_WIDTH = 120;
const POLL_INTERVAL_MS = 250;
const SPINNER_INTERVAL_MS = 500;

type WritableLike = {
  write: (...args: any[]) => boolean;
};

type OutputGuard = {
  write: (stream: WritableLike, chunk: string | Buffer) => boolean;
  restore: () => void;
};

function colorize(value: string, color: string) {
  return `${color}${value}${RESET}`;
}

function stripAnsi(value: string) {
  return value.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '');
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

function frameWidth(columns: number) {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, columns || MIN_WIDTH));
}

function capCapturedText(value: string) {
  if (value.length <= MAX_CAPTURED_LOG_CHARS) return value;
  return `${value.slice(0, MAX_CAPTURED_LOG_CHARS - 1)}…`;
}

function formatStatus(state: BotState, spinnerFrame: string) {
  if (state.status === 'running') return colorize(`${spinnerFrame} RUNNING`, GREEN);
  if (state.status === 'error') return colorize('ERROR', RED);
  return colorize('IDLE', YELLOW);
}

function formatLastPass(timestampMs: number) {
  if (!Number.isFinite(timestampMs) || timestampMs <= 0) return 'never';
  const date = new Date(timestampMs);
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function normalizeOpportunity(opportunity: BotOpportunityRow, index: number, width: number) {
  const prefix = colorize(`${String(index + 1).padStart(2, '0')}.`, CYAN);
  const { routeWidth, route, profit, roi } = visibleOpportunityParts(opportunity, width);
  return `${prefix} ${pad(route, routeWidth)} ${colorize('profit', DIM)} ${pad(profit, 14)} ${colorize('roi', DIM)} ${roi}`;
}

function visibleOpportunityParts(opportunity: BotOpportunityRow, width: number) {
  const routeWidth = Math.max(18, width - 30);
  return {
    routeWidth,
    route: truncate(opportunity.Route || 'n/a', routeWidth),
    profit: truncate(opportunity.Profit || 'n/a', 14),
    roi: truncate(opportunity.ROI || 'n/a', 10),
  };
}

function summarizeLogLevel(line: string) {
  if (line.includes('[FATAL]')) return RED;
  if (line.includes('[ERROR]')) return RED;
  if (line.includes('[WARN]')) return YELLOW;
  if (line.includes('[DEBUG]')) return BLUE;
  return WHITE;
}

function normalizeLogLine(line: string) {
  return line
    .replace(/\s+/g, ' ')
    .replace(/topReject=net profit ([^|]+)/g, 'topReject=net_profit $1')
    .trim();
}

function formatLogs(state: BotState, width: number) {
  const logs = state.logs.slice(0, MAX_LOGS);
  if (logs.length === 0) {
    return [colorize('No logs yet...', DIM)];
  }

  return logs.map((line) => colorize(truncate(normalizeLogLine(line), width), summarizeLogLevel(line)));
}

function appendCapturedLog(state: BotState, label: string, line: string) {
  const normalized = capCapturedText(stripAnsi(line).replace(/\s+/g, ' ').trim());
  if (!normalized) return;

  const prefix = label === 'stderr' ? '[STDERR]' : '[STDOUT]';
  const entry = `${prefix} ${normalized}`;
  if (state.logs[0] === entry) return;

  state.logs.unshift(entry);
  if (state.logs.length > MAX_STATE_LOGS) state.logs.length = MAX_STATE_LOGS;
}

function installOutputGuard(state: BotState, streams: Array<{ label: string; stream: WritableLike }>): OutputGuard {
  const originals = new Map<WritableLike, WritableLike['write']>();
  const buffers = new Map<WritableLike, string>();
  const labels = new Map<WritableLike, string>();
  let bypassDepth = 0;

  for (const { label, stream } of streams) {
    if (originals.has(stream)) continue;

    const originalWrite = stream.write.bind(stream) as WritableLike['write'];
    originals.set(stream, originalWrite);
    buffers.set(stream, '');
    labels.set(stream, label);

    stream.write = (chunk, encoding, cb) => {
      if (bypassDepth > 0) return originalWrite(chunk, encoding as BufferEncoding, cb);

      const callback = typeof encoding === 'function' ? encoding : cb;
      const text = typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString();
      const combined = `${buffers.get(stream) ?? ''}${text}`;
      const lines = combined.split(/\r?\n/);
      buffers.set(stream, capCapturedText(lines.pop() ?? ''));

      for (const line of lines) appendCapturedLog(state, labels.get(stream) ?? 'stdout', line);
      if (callback) queueMicrotask(() => (callback as () => void)());
      return true;
    };
  }

  return {
    write(stream: WritableLike, chunk: string | Buffer) {
      const originalWrite = originals.get(stream);
      if (!originalWrite) return stream.write(chunk);

      bypassDepth += 1;
      try {
        return originalWrite(chunk);
      } finally {
        bypassDepth -= 1;
      }
    },
    restore() {
      for (const [stream, partial] of buffers) {
        appendCapturedLog(state, labels.get(stream) ?? 'stdout', partial);
      }
      buffers.clear();

      for (const [stream, originalWrite] of originals) {
        stream.write = originalWrite;
      }
      originals.clear();
    },
  };
}

function section(title: string, width: number, color: string) {
  const label = ` ${title.toUpperCase()} `;
  const ruleWidth = Math.max(0, width - label.length);
  return `${colorize(label, color)}${colorize('─'.repeat(ruleWidth), DIM)}`;
}

function renderFrame(state: BotState, columns: number, spinnerFrame: string): string {
  const width = frameWidth(columns);
  const innerWidth = width - 4;
  const top = `┌${'─'.repeat(width - 2)}┐`;
  const bottom = `└${'─'.repeat(width - 2)}┘`;
  const title = pad(`${BOLD}Polygon Arbitrage Bot${RESET}`, innerWidth);
  const subtitle = pad(`${DIM}live monitor${RESET}`, innerWidth);
  const stats = [
    `${colorize('status', DIM)} ${formatStatus(state, spinnerFrame)}`,
    `${colorize('passes', DIM)} ${state.passCount}`,
    `${colorize('errors', DIM)} ${state.consecutiveErrors}`,
    `${colorize('last', DIM)} ${formatLastPass(state.lastArbMs)}`,
  ].join(` ${colorize('•', DIM)} `);
  const market = [
    `${colorize('gas', DIM)} ${state.gasPrice} gwei`,
    `${colorize('matic', DIM)} $${state.maticPrice}`,
  ].join(` ${colorize('•', DIM)} `);

  const lines = [
    top,
    `│ ${pad(title, innerWidth)} │`,
    `│ ${pad(subtitle, innerWidth)} │`,
    `│ ${pad('', innerWidth)} │`,
    `│ ${pad(truncate(stats, innerWidth), innerWidth)} │`,
    `│ ${pad(truncate(market, innerWidth), innerWidth)} │`,
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
  const width = frameWidth(columns);
  const innerWidth = width - 4;
  return JSON.stringify({
    columns: width,
    status: state.status,
    passCount: state.passCount,
    consecutiveErrors: state.consecutiveErrors,
    gasPrice: state.gasPrice,
    maticPrice: state.maticPrice,
    lastArbMs: state.lastArbMs,
    opportunities: state.opportunities.slice(0, MAX_OPPORTUNITIES).map((opportunity) => {
      const { route, profit, roi } = visibleOpportunityParts(opportunity, innerWidth);
      return { route, profit, roi };
    }),
    logs: state.logs.slice(0, MAX_LOGS).map((line) => truncate(normalizeLogLine(line), innerWidth)),
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
  let stdinActive = false;
  let outputGuard: OutputGuard | null = null;

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
      const frame = renderFrame(state, columns, spinnerFrame);
      outputGuard ? outputGuard.write(stdout, frame) : stdout.write(frame);
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
    stdout.off('error', stop);
    stdout.off('resize', onResize);
    if (stdinActive) {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdinActive = false;
    }
    outputGuard?.restore();
    outputGuard = null;
    if (alternateScreenActive && stdout.isTTY) stdout.write(`${ESC}?1049l${ESC}?25h`);
  };

  if (!stdout.isTTY) {
    return () => {};
  }

  stdout.on('error', stop);
  stdout.on('resize', onResize);
  stdout.write(`${ESC}?1049h${ESC}H`);
  alternateScreenActive = true;
  outputGuard = installOutputGuard(state, [
    { label: 'stdout', stream: stdout },
    { label: 'stderr', stream: process.stderr },
  ]);

  if (stdin.isTTY && typeof stdin.setRawMode === 'function') {
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', onData);
    stdinActive = true;
  }
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
  formatLastPass,
  installOutputGuard,
  renderFrame,
  signatureFor,
};
