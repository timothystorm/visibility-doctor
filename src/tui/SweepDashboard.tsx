import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import type { CheckResult, CheckStatus, Layer } from '../types.js';
import { LAYER_ORDER, LAYER_LABELS } from '../types.js';
import { LayerCard } from './LayerCard.js';
import { runSweep } from '../checks/runner.js';
import { loadSession } from '../auth/session.js';
import type { EnvConfig } from '../config/types.js';
import type { Session } from '../types.js';

type LayerState = {
  status: CheckStatus;
  result?: CheckResult;
};

type Props = {
  envName: string;
  env: EnvConfig;
};

export function SweepDashboard({ envName, env }: Props) {
  const initial: Record<Layer, LayerState> = Object.fromEntries(
    LAYER_ORDER.map((l) => [l, { status: 'pending' as CheckStatus }]),
  ) as Record<Layer, LayerState>;

  const [layers, setLayers] = useState<Record<Layer, LayerState>>(initial);
  const [done, setDone] = useState(false);
  const [session, setSession] = useState<Session | null>(null);

  const setLayerRunning = (layer: Layer) => {
    setLayers((prev) => ({ ...prev, [layer]: { status: 'running' } }));
  };

  const setLayerResult = (result: CheckResult) => {
    setLayers((prev) => ({
      ...prev,
      [result.layer]: { status: result.status, result },
    }));
  };

  useEffect(() => {
    // Load session synchronously before sweep starts
    const loaded = loadSession(envName);
    setSession(loaded);

    for (const layer of LAYER_ORDER) {
      setLayerRunning(layer);
    }

    runSweep(env, loaded, ({ result }) => setLayerResult(result)).then(() => {
      setDone(true);
    });
  }, []);

  const hotspots = LAYER_ORDER
    .map((l) => layers[l].result)
    .filter((r): r is CheckResult => !!r && (r.status === 'failing' || r.status === 'degraded'));

  const allDone = LAYER_ORDER.every((l) => {
    const s = layers[l].status;
    return s !== 'pending' && s !== 'running';
  });

  return (
    <Box flexDirection="column" gap={1} padding={1}>
      {/* Header */}
      <Box gap={2}>
        <Text bold color="cyan">👁  visibility-doctor</Text>
        <Text dimColor>sweeping</Text>
        <Text bold>{envName}</Text>
        {!allDone && <Text color="cyan"> ◌ running…</Text>}
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
              latencyMs={result?.latencyMs}
              expanded={isHotspot && !!result?.nextSteps?.length}
              nextSteps={result?.nextSteps}
            />
          );
        })}
      </Box>

      {/* Summary line */}
      {done && (
        <Box marginTop={1}>
          {hotspots.length === 0 ? (
            <Text color="green" bold>✓ All layers healthy</Text>
          ) : (
            <Text color="yellow" bold>
              △ {hotspots.length} hotspot{hotspots.length > 1 ? 's' : ''} found —{' '}
              likely in{' '}
              {hotspots.map((h) => LAYER_LABELS[h.layer]).join(', ')}
            </Text>
          )}
        </Box>
      )}
    </Box>
  );
}
