import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import Spinner from 'ink-spinner';
import Gradient from 'ink-gradient';
import BigText from 'ink-big-text';
import type { BotOpportunityRow, BotState } from './types.ts';

const MAX_OPPORTUNITIES = 5;
const MAX_LOGS = 8;
const REFRESH_INTERVAL_MS = 250;

type LogTone = 'red' | 'yellow' | 'blue' | 'white';

export function snapshotBotState(state: BotState): BotState {
  return {
    ...state,
    opportunities: state.opportunities.slice(0, MAX_OPPORTUNITIES).map((opportunity) => ({ ...opportunity })),
    logs: state.logs.slice(0, MAX_LOGS),
  };
}

export function formatLastPass(timestampMs: number) {
  if (!Number.isFinite(timestampMs) || timestampMs <= 0) return 'never';
  const date = new Date(timestampMs);
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export function formatCount(value: unknown) {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return '0';
  return Math.trunc(numeric).toLocaleString('en-US');
}

export function formatDurationMs(value: unknown) {
  const ms = Number(value ?? 0);
  if (!Number.isFinite(ms) || ms <= 0) return 'n/a';
  if (ms < 1_000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1_000).toFixed(ms < 10_000 ? 1 : 0)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1_000);
  return `${minutes}m ${seconds}s`;
}

export function formatAge(timestampMs: unknown, now = Date.now()) {
  const timestamp = Number(timestampMs ?? 0);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return 'never';
  const ageMs = Math.max(0, now - timestamp);
  if (ageMs < 1_000) return 'now';
  if (ageMs < 60_000) return `${Math.floor(ageMs / 1_000)}s ago`;
  if (ageMs < 3_600_000) return `${Math.floor(ageMs / 60_000)}m ago`;
  return `${Math.floor(ageMs / 3_600_000)}h ago`;
}

export function normalizeLogLine(line: string) {
  return line
    .replace(/\s+/g, ' ')
    .replace(/topReject=net profit ([^|]+)/g, 'topReject=net_profit $1')
    .trim();
}

export function logTone(line: string): LogTone {
  if (line.includes('[FATAL]') || line.includes('[ERROR]')) return 'red';
  if (line.includes('[WARN]')) return 'yellow';
  if (line.includes('[DEBUG]')) return 'blue';
  return 'white';
}

function latestMatch(logs: string[], pattern: RegExp) {
  for (const line of logs) {
    const match = normalizeLogLine(line).match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

function latestEvent(logs: string[]) {
  for (const line of logs) {
    const match = normalizeLogLine(line).match(/^\[[^\]]+\]\s+([a-z][a-z0-9_]*)/i);
    if (match?.[1]) return match[1];
  }
  return 'none';
}

function logSeverityCounts(logs: string[]) {
  return logs.reduce(
    (counts, line) => {
      if (line.includes('[ERROR]') || line.includes('[FATAL]')) counts.errors += 1;
      else if (line.includes('[WARN]')) counts.warnings += 1;
      else if (line.includes('[DEBUG]')) counts.debug += 1;
      else counts.info += 1;
      return counts;
    },
    { errors: 0, warnings: 0, info: 0, debug: 0 },
  );
}

export function signalSummary(state: BotState) {
  const counts = logSeverityCounts(state.logs);
  return {
    event: latestEvent(state.logs),
    topReject: latestMatch(state.logs, /topReject=([^|]+)/) ?? 'none',
    missingRates: latestMatch(state.logs, /missingRates=(\d+)/) ?? '0',
    errors: counts.errors,
    warnings: counts.warnings,
  };
}

function statusColor(status: BotState['status']) {
  if (status === 'running') return 'green';
  if (status === 'error') return 'red';
  return 'yellow';
}

function Metric({ label, value, color = 'white' }: { label: string; value: string; color?: string }) {
  return (
    <Box marginRight={3}>
      <Text dimColor>{label} </Text>
      <Text color={color}>{value}</Text>
    </Box>
  );
}

function MetricRow({ children }: { children: React.ReactNode }) {
  return (
    <Box flexDirection="row" flexWrap="wrap">
      {children}
    </Box>
  );
}

function Section({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={color} paddingX={1} marginBottom={1}>
      <Text bold color={color}>{title}</Text>
      {children}
    </Box>
  );
}

function OpportunityRow({ opportunity, index }: { opportunity: BotOpportunityRow; index: number }) {
  return (
    <Box>
      <Box width={4}><Text color="cyan">{String(index + 1).padStart(2, '0')}.</Text></Box>
      <Box width="55%"><Text wrap="truncate-end">{opportunity.Route || 'n/a'}</Text></Box>
      <Box width="25%"><Text color="green" wrap="truncate-end">{opportunity.Profit || 'n/a'}</Text></Box>
      <Box width="15%"><Text color="magenta" wrap="truncate-end">{opportunity.ROI || 'n/a'}</Text></Box>
    </Box>
  );
}

function Opportunities({ opportunities }: { opportunities: BotOpportunityRow[] }) {
  if (opportunities.length === 0) {
    return <Text dimColor>No opportunities found yet.</Text>;
  }

  return (
    <Box flexDirection="column">
      <Box>
        <Box width={4}><Text dimColor>#</Text></Box>
        <Box width="55%"><Text dimColor>route</Text></Box>
        <Box width="25%"><Text dimColor>profit</Text></Box>
        <Box width="15%"><Text dimColor>roi</Text></Box>
      </Box>
      {opportunities.slice(0, MAX_OPPORTUNITIES).map((opportunity, index) => (
        <OpportunityRow key={`${opportunity.Route}:${index}`} opportunity={opportunity} index={index} />
      ))}
    </Box>
  );
}

export function Dashboard({ state, now = Date.now() }: { state: BotState; now?: number }) {
  const signal = useMemo(() => signalSummary(state), [state]);
  const updatedAt = state.lastUpdateMs || state.lastArbMs;
  const opportunityCount = state.lastOpportunityCount ?? state.opportunities.length;

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}>
        <Gradient name="cristal">
          <BigText text="ARB" font="tiny" />
        </Gradient>
        <Box flexDirection="column" marginLeft={2}>
          <Text bold>Polygon Arbitrage Bot</Text>
          <Text dimColor>Live execution monitor</Text>
          <Text color={statusColor(state.status)}>
            {state.status === 'running' ? <Spinner type="dots" /> : null} {state.status.toUpperCase()}
          </Text>
        </Box>
      </Box>

      <Section title="Overview" color="cyan">
        <MetricRow>
          <Metric label="mode" value={state.mode} color="cyan" />
          <Metric label="passes" value={formatCount(state.passCount)} color="cyan" />
          <Metric label="errors" value={formatCount(state.consecutiveErrors)} color={state.consecutiveErrors > 0 ? 'red' : 'green'} />
          <Metric label="last pass" value={formatDurationMs(state.lastPassDurationMs)} />
          <Metric label="updated" value={formatAge(updatedAt, now)} />
        </MetricRow>
        <MetricRow>
          <Metric label="gas" value={`${state.gasPrice} gwei`} color="yellow" />
          <Metric label="eval" value={formatCount(state.lastPathsEvaluated)} color="cyan" />
          <Metric label="candidates" value={formatCount(state.lastCandidateCount)} color="cyan" />
          <Metric label="top" value={formatCount(state.lastShortlistCount)} color="cyan" />
          <Metric label="optimized" value={formatCount(state.lastOptimizedCount)} color="cyan" />
          <Metric label="profitable" value={formatCount(state.lastProfitableCount)} color={state.lastProfitableCount ? 'green' : 'white'} />
        </MetricRow>
        <MetricRow>
          <Metric label="pools" value={formatCount(state.stateCacheSize)} color="cyan" />
          <Metric label="paths" value={formatCount(state.cachedPathCount)} color="cyan" />
          <Metric label="opps" value={formatCount(opportunityCount)} color={opportunityCount > 0 ? 'green' : 'white'} />
          <Metric label="shown" value={formatCount(Math.min(state.opportunities.length, MAX_OPPORTUNITIES))} />
          <Metric label="last loop" value={formatLastPass(state.lastArbMs)} />
          <Metric label="log rows" value={formatCount(state.logs.length)} />
        </MetricRow>
        <MetricRow>
          <Metric label="signal" value={signal.event} color="cyan" />
          <Metric label="reject" value={signal.topReject} color={signal.topReject === 'none' ? 'green' : 'yellow'} />
          <Metric label="missingRates" value={signal.missingRates} color={signal.missingRates === '0' ? 'green' : 'yellow'} />
          <Metric label="logs" value={`${signal.errors} err / ${signal.warnings} warn`} color={signal.errors > 0 ? 'red' : signal.warnings > 0 ? 'yellow' : 'green'} />
        </MetricRow>
      </Section>

      <Section title="Top Opportunities" color="magenta">
        <Opportunities opportunities={state.opportunities} />
      </Section>

      <Section title="Recent Logs" color="blue">
        {state.logs.length === 0 ? (
          <Text dimColor>No logs yet.</Text>
        ) : (
          state.logs.slice(0, MAX_LOGS).map((line, index) => (
            <Text key={`${line}:${index}`} color={logTone(line)} wrap="truncate-end">
              {normalizeLogLine(line)}
            </Text>
          ))
        )}
      </Section>
    </Box>
  );
}

export const App = ({ state, onExit }: { state: BotState; onExit?: () => void }) => {
  const { exit } = useApp();
  const [snapshot, setSnapshot] = useState(() => snapshotBotState(state));

  useEffect(() => {
    const timer = setInterval(() => {
      setSnapshot(snapshotBotState(state));
    }, REFRESH_INTERVAL_MS);
    timer.unref?.();
    return () => clearInterval(timer);
  }, [state]);

  useInput((input) => {
    if (input.toLowerCase() === 'q') {
      onExit?.();
      exit();
    }
  });

  return <Dashboard state={snapshot} />;
};
