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
  const { waitUntilExit } = render(<App envs={envs} defaultEnv={defaultEnv} />);
  // On Windows, process.stdin in raw mode holds an active event-loop reference
  // that survives Ink's internal cleanup (setRawMode(false) / pause()). Without
  // this, the process hangs after the user presses 'q' even though the TUI has
  // finished rendering. waitUntilExit() resolves as soon as exit() is called
  // inside any child component, so process.exit(0) fires only after Ink has
  // fully unmounted — safe on macOS and the necessary escape hatch on Windows.
  waitUntilExit().then(() => process.exit(0));
}
