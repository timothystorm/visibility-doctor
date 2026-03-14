import React, { useState } from 'react';
import { render } from 'ink';
import { EnvPicker } from './EnvPicker.js';
import { SweepDashboard } from './SweepDashboard.js';
import type { EnvConfig } from '../config/types.js';

type AppState =
  | { stage: 'pick' }
  | { stage: 'sweep'; envName: string; env: EnvConfig };

type Props = {
  envs: Record<string, EnvConfig>;
  defaultEnv?: string;
};

function App({ envs, defaultEnv }: Props) {
  const [state, setState] = useState<AppState>({ stage: 'pick' });

  if (state.stage === 'pick') {
    return (
      <EnvPicker
        envs={envs}
        defaultEnv={defaultEnv}
        onSelect={(name, env) => setState({ stage: 'sweep', envName: name, env })}
      />
    );
  }

  return <SweepDashboard envName={state.envName} env={state.env} />;
}

export function launchTui(envs: Record<string, EnvConfig>, defaultEnv: string | undefined) {
  render(<App envs={envs} defaultEnv={defaultEnv} />);
}
