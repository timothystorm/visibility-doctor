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
  detail?: string;
  runningMessage?: string;
  expanded?: boolean;
  nextSteps?: string[];
};

export function LayerCard({ label, status, summary, detail, runningMessage, expanded, nextSteps }: Props) {
  const color = STATUS_COLOR[status];
  const icon = STATUS_ICON[status];
  const isHotspot = status === 'failing' || status === 'degraded';

  const displaySummary =
    status === 'running'
      ? (runningMessage ?? 'checking…')
      : summary ?? (status === 'pending' ? '—' : '—');

  return (
    <Box flexDirection="column">
      {/* Status row */}
      <Box gap={2}>
        <Text color={color} bold>{icon}</Text>
        <Text bold={isHotspot} color={color === 'gray' ? undefined : color}>
          {label.padEnd(14)}
        </Text>
        <Text dimColor={status === 'pending' || status === 'skipped' || status === 'running'}>
          {displaySummary}
        </Text>
      </Box>

      {/* Hotspot drill-down — detail + next steps */}
      {expanded && (
        <Box flexDirection="column" paddingLeft={4} marginTop={1} marginBottom={1}>
          {detail && (
            <Box marginBottom={1}>
              <Text color={color}>{detail}</Text>
            </Box>
          )}
          {nextSteps && nextSteps.length > 0 && (
            <Box flexDirection="column">
              <Text bold color={color}>Next steps:</Text>
              {nextSteps.map((step, i) => (
                <Text key={i} color={color}>  {i + 1}. {step}</Text>
              ))}
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
