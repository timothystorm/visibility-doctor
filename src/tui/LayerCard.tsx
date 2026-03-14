import React from 'react';
import { Box, Text } from 'ink';
import type { CheckStatus } from '../types.js';

const STATUS_ICON: Record<CheckStatus, string> = {
  pending:  '○',
  running:  '◌',
  healthy:  '✓',
  degraded: '△',
  failing:  '✗',
  skipped:  '–',
};

const STATUS_COLOR: Record<CheckStatus, string> = {
  pending:  'gray',
  running:  'cyan',
  healthy:  'green',
  degraded: 'yellow',
  failing:  'red',
  skipped:  'gray',
};

type Props = {
  label: string;
  status: CheckStatus;
  summary?: string;
  latencyMs?: number;
  /** Whether this card is expanded to show nextSteps */
  expanded?: boolean;
  nextSteps?: string[];
};

export function LayerCard({ label, status, summary, latencyMs, expanded, nextSteps }: Props) {
  const color = STATUS_COLOR[status];
  const icon = STATUS_ICON[status];

  return (
    <Box flexDirection="column">
      <Box gap={2}>
        {/* Status icon */}
        <Text color={color} bold>
          {icon}
        </Text>

        {/* Layer name */}
        <Text bold={status === 'failing' || status === 'degraded'} color={color === 'gray' ? undefined : color}>
          {label.padEnd(20)}
        </Text>

        {/* Summary */}
        <Text dimColor={status === 'pending' || status === 'skipped'}>
          {summary ?? (status === 'running' ? 'checking…' : '—')}
        </Text>

        {/* Latency badge */}
        {latencyMs !== undefined && (
          <Text dimColor>  {latencyMs}ms</Text>
        )}
      </Box>

      {/* Hotspot drill-down */}
      {expanded && nextSteps && nextSteps.length > 0 && (
        <Box flexDirection="column" paddingLeft={4} marginTop={1} marginBottom={1}>
          <Text color="yellow" bold>Next steps:</Text>
          {nextSteps.map((step, i) => (
            <Text key={i} color="yellow">
              {i + 1}. {step}
            </Text>
          ))}
        </Box>
      )}
    </Box>
  );
}
