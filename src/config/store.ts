import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Config, EnvConfig } from './types.js';

// ─── Location ─────────────────────────────────────────────────────────────────
// All state lives in ~/.config/vis-doc/ — predictable, memorable, editable.

export const CONFIG_DIR = path.join(os.homedir(), '.config', 'vis-doc');
export const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
export const SESSION_FILE = path.join(CONFIG_DIR, 'session.json');

// ─── Default config ───────────────────────────────────────────────────────────
// Written on first use so there is always something to start from.
// Edit ~/.config/vis-doc/config.json directly or use `vdoc config add`.

const DEFAULT_CONFIG: Config = {
  defaultEnv: 'prod',
  envs: {
    prod: {
      name: 'Production',
      loginUrl: 'https://REPLACE_WITH_YOUR_LOGIN_URL',
      baseUrl: 'https://REPLACE_WITH_YOUR_APP_URL',
      graphqlEndpoint: 'https://REPLACE_WITH_YOUR_GRAPHQL_URL/graphql',
      mfeRoutes: ['/visibility', '/monitor', '/overview', '/detail'],
      cookieNames: ['REPLACE_WITH_SESSION_COOKIE_NAME'],
      traefikHealthUrl: undefined,
      aksNamespace: undefined,
    },
  },
};

// ─── Init ─────────────────────────────────────────────────────────────────────

export function ensureConfigDir(): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

/**
 * Returns true when the config was just created (first run).
 * Callers can use this to print a first-run notice.
 *
 * @return true if the config file was just created (first run), false otherwise
 */
export function initConfigIfMissing(): boolean {
  ensureConfigDir();
  if (!fs.existsSync(CONFIG_FILE)) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n', 'utf8');
    return true;
  }
  return false;
}

// ─── Read / write ─────────────────────────────────────────────────────────────

export function readConfig(): Config {
  initConfigIfMissing();
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) as Config;
  } catch {
    throw new Error(`Could not parse ${CONFIG_FILE} — check for JSON syntax errors.`);
  }
}

export function writeConfig(config: Config): void {
  ensureConfigDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + '\n', 'utf8');
}

// ─── Accessors ────────────────────────────────────────────────────────────────

export function getConfig(): Config {
  return readConfig();
}

export function getEnvNames(): string[] {
  return Object.keys(readConfig().envs ?? {});
}

export function getEnv(name: string): EnvConfig | undefined {
  return readConfig().envs?.[name];
}

export function setEnv(name: string, env: EnvConfig): void {
  const config = readConfig();
  config.envs[name] = env;
  writeConfig(config);
}

export function removeEnv(name: string): void {
  const config = readConfig();
  delete config.envs[name];
  writeConfig(config);
}

export function getDefaultEnv(): string | undefined {
  return readConfig().defaultEnv;
}

export function setDefaultEnv(name: string): void {
  const config = readConfig();
  config.defaultEnv = name;
  writeConfig(config);
}

export function setDynatrace(cfg: Config['dynatrace']): void {
  const config = readConfig();
  config.dynatrace = cfg;
  writeConfig(config);
}

export function configPath(): string {
  return CONFIG_FILE;
}
