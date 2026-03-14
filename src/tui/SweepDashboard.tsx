import React, { useEffect, useState } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import type { CheckResult, CheckStatus, Layer } from '../types.js';
import { LAYER_ORDER, LAYER_LABELS } from '../types.js';
import { LayerCard } from './LayerCard.js';
import { runSweep } from '../checks/runner.js';
import { loadSession } from '../auth/session.js';
import type { EnvConfig } from '../config/types.js';

// Message shown while a layer is running — overrides the generic "checking…"
const RUNNING_MSG: Partial<Record<Layer, string>> = {
  page: 'opening browser…',
};

type LayerState = {
  status: CheckStatus;
  result?: CheckResult;
};

type Props = {
  envName: string;
  env: EnvConfig;
};

export function SweepDashboard({ envName, env }: Props) {
  const { exit } = useApp();

  const initial: Record<Layer, LayerState> = Object.fromEntries(
    LAYER_ORDER.map((l) => [l, { status: 'pending' as CheckStatus }]),
  ) as Record<Layer, LayerState>;

  const [layers, setLayers] = useState<Record<Layer, LayerState>>(initial);
  const [done, setDone] = useState(false);

  const setLayerRunning = (layer: Layer) =>
    setLayers((prev) => ({ ...prev, [layer]: { status: 'running' } }));

  const setLayerResult = (result: CheckResult) =>
    setLayers((prev) => ({
      ...prev,
      [result.layer]: { status: result.status, result },
    }));

  useEffect(() => {
    const session = loadSession(envName);

    runSweep(
      env,
      session,
      ({ result }) => setLayerResult(result),
      (layer) => setLayerRunning(layer),
    ).then(() => setDone(true));
  }, []);

  // Allow quitting after sweep finishes
  useInput((input, key) => {
    if (done && (input === 'q' || key.escape)) exit();
  });

  const hotspots = LAYER_ORDER
    .map((l) => layers[l].result)
    .filter((r): r is CheckResult => !!r && (r.status === 'failing' || r.status === 'degraded'));

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1} gap={1}>

      {/* Header */}
      <Box gap={2}>
        <Text bold color="cyan">👁  visibility-doctor</Text>
        <Text dimColor>sweeping</Text>
        <Text bold color="white">{envName}</Text>
        {!done && <Text color="cyan">  ◌ running…</Text>}
      </Box>

      {/* Layer cards */}
      <Box flexDirection="column">
        {LAYER_ORDER.map((layer) => {
          const { status, result } = layers[layer];
          const isHotspot = status === 'failing' || status === 'degraded';
          return (
            <LayerCard
              key={layer}
              label={LAYER_LABELS[layer]}
              status={status}
              summary={result?.summary}
              detail={result?.detail}
              runningMessage={RUNNING_MSG[layer]}
              expanded={isHotspot}
              nextSteps={result?.nextSteps}
            />
          );
        })}
      </Box>

      {/* Summary + exit hint */}
      {done && (
        <Box flexDirection="column" gap={1} marginTop={1}>
          {hotspots.length === 0 ? (
            <Text color="green" bold>✓ All layers healthy</Text>
          ) : (
            <Text color="yellow" bold>
              △ {hotspots.length} hotspot{hotspots.length > 1 ? 's' : ''} detected —{' '}
              {hotspots.map((h) => LAYER_LABELS[h.layer]).join(', ')}
            </Text>
          )}
          <Text dimColor>press q to exit</Text>
        </Box>
      )}

    </Box>
  );
}
