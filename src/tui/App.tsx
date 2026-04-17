import React, { useState, useEffect } from 'react';
import { Box, Text, Newline, useInput, useApp } from 'ink';
import Spinner from 'ink-spinner';
import Table from 'ink-table';
import Gradient from 'ink-gradient';
import BigText from 'ink-big-text';

interface TuiState {
  passCount: number;
  consecutiveErrors: number;
  gasPrice: string;
  maticPrice: string;
  lastArbMs: number;
  opportunities: any[];
  logs: string[];
  status: 'idle' | 'running' | 'error';
}

export const App = ({ initialState }: { initialState: TuiState }) => {
  const [state, setState] = useState<TuiState>(initialState);
  const { exit } = useApp();

  useInput((input, key) => {
    if (input === 'q') {
      exit();
    }
  });

  // This would be updated via a global state or event emitter in a real app
  // For now, we'll assume the runner updates this state
  useEffect(() => {
    const interval = setInterval(() => {
      // In a real implementation, we'd fetch the latest state from the runner
      // For this demo, we'll just listen for updates if we had an event emitter
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Box flexDirection="column" padding={1}>
      <Gradient name="rainbow">
        <BigText text="TS-HSYNC-ARB" font="tiny" />
      </Gradient>

      <Box borderStyle="round" borderColor="cyan" paddingX={1} marginBottom={1}>
        <Box flexDirection="column">
          <Box>
            <Text bold color="yellow">Status: </Text>
            {state.status === 'running' ? (
              <Text color="green">
                <Spinner type="dots" /> RUNNING
              </Text>
            ) : (
              <Text color="red">{state.status.toUpperCase()}</Text>
            )}
          </Box>
          <Box>
            <Text bold color="yellow">Passes: </Text>
            <Text>{state.passCount}</Text>
            <Text bold color="yellow" marginLeft={2}>Errors: </Text>
            <Text color={state.consecutiveErrors > 0 ? 'red' : 'white'}>
              {state.consecutiveErrors}
            </Text>
          </Box>
          <Box>
            <Text bold color="yellow">Gas: </Text>
            <Text>{state.gasPrice} Gwei</Text>
            <Text bold color="yellow" marginLeft={2}>MATIC: </Text>
            <Text>${state.maticPrice}</Text>
          </Box>
        </Box>
      </Box>

      <Text bold color="magenta">Recent Opportunities</Text>
      <Box borderStyle="single" borderColor="magenta" marginBottom={1}>
        {state.opportunities.length > 0 ? (
          <Table data={state.opportunities} />
        ) : (
          <Text italic color="gray">No opportunities found yet...</Text>
        )}
      </Box>

      <Text bold color="blue">Recent Logs</Text>
      <Box borderStyle="single" borderColor="blue" height={10} flexDirection="column">
        {state.logs.map((log, i) => (
          <Text key={i} wrap="truncate-end">{log}</Text>
        ))}
      </Box>

      <Box marginTop={1} justifyContent="space-between">
        <Text color="gray">Press 'q' to exit | 'r' to refresh</Text>
        <Text color="gray">v2.0.0</Text>
      </Box>
    </Box>
  );
};
