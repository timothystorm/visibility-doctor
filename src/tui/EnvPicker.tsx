import React, { useState } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import type { EnvConfig } from '../config/types.js';

type Props = {
  envs: Record<string, EnvConfig>;
  defaultEnv?: string;
  onSelect: (name: string, env: EnvConfig) => void;
};

export function EnvPicker({ envs, defaultEnv, onSelect }: Props) {
  const names = Object.keys(envs);
  const defaultIndex = defaultEnv ? names.indexOf(defaultEnv) : 0;
  const [selected, setSelected] = useState(Math.max(0, defaultIndex));
  const { exit } = useApp();

  useInput((input, key) => {
    if (key.upArrow) {
      setSelected((s) => Math.max(0, s - 1));
    } else if (key.downArrow) {
      setSelected((s) => Math.min(names.length - 1, s + 1));
    } else if (key.return) {
      const name = names[selected];
      onSelect(name, envs[name]);
    } else if (input === 'q' || key.escape) {
      exit();
    }
  });

  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="column">
        <Text bold color="cyan">
          👁  visibility-doctor
        </Text>
        <Text dimColor>Select an environment to sweep  •  ↑↓ navigate  •  ↵ select  •  q quit</Text>
      </Box>

      <Box flexDirection="column">
        {names.map((name, i) => {
          const isSelected = i === selected;
          return (
            <Box key={name} gap={2}>
              <Text color={isSelected ? 'cyan' : undefined}>
                {isSelected ? '❯' : ' '}
              </Text>
              <Text bold={isSelected} color={isSelected ? 'white' : 'gray'}>
                {envs[name].name}
              </Text>
              <Text dimColor>{envs[name].baseUrl}</Text>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
