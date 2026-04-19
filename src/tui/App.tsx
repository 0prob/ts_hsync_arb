import { Box, Text, useInput, useApp } from 'ink';
import Spinner from 'ink-spinner';
import InkTable from 'ink-table';
import Gradient from 'ink-gradient';
import BigText from 'ink-big-text';
import type { JSX } from 'react';
import type { BotState } from './index.tsx';

const Table = InkTable as unknown as (props: { data: BotState["opportunities"] }) => JSX.Element;

export const App = ({ state }: { state: BotState }) => {
  const { exit } = useApp();

  useInput((input) => {
    if (input === 'q') exit();
  });

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
            <Box marginLeft={2}><Text bold color="yellow">Errors: </Text></Box>
            <Text color={state.consecutiveErrors > 0 ? 'red' : 'white'}>
              {state.consecutiveErrors}
            </Text>
          </Box>
          <Box>
            <Text bold color="yellow">Gas: </Text>
            <Text>{state.gasPrice} Gwei</Text>
            <Box marginLeft={2}><Text bold color="yellow">MATIC: </Text></Box>
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
        {state.logs.map((line, i) => (
          <Text key={i} wrap="truncate-end">{line}</Text>
        ))}
      </Box>

      <Box marginTop={1}>
        <Text color="gray">Press 'q' to exit</Text>
      </Box>
    </Box>
  );
};
