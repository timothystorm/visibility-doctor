import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { CONFIG_DIR } from '../config/store.js';

// ─── System Chrome candidates ─────────────────────────────────────────────────
// We spawn Chrome directly as a plain OS process — no Playwright launch wrapper.
// This means zero automation flags, no `navigator.webdriver`, no CDP fingerprints.
// ForgeRock sees a completely normal browser session.

const CHROME_PATHS: Record<string, string[]> = {
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ],
  linux: [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/snap/bin/chromium',
  ],
  win32: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(os.homedir(), 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'),
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ],
};

export function findSystemChrome(): string | null {
  const platform = os.platform();
  const candidates = CHROME_PATHS[platform] ?? [];
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

// ─── Persistent profile dir ───────────────────────────────────────────────────
// One profile per environment so sessions don't bleed between envs.

export function chromeProfileDir(envName: string): string {
  return path.join(CONFIG_DIR, 'chrome-profiles', envName);
}

// ─── Free port finder ─────────────────────────────────────────────────────────

export function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('Could not get port'));
        return;
      }
      const { port } = addr;
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

// ─── Chrome process launch ────────────────────────────────────────────────────

export type ChromeProcess = {
  process: ChildProcess;
  cdpUrl: string;
  port: number;
};

/**
 * Spawn Chrome as a regular OS process with remote debugging enabled.
 * No Playwright launch wrapper — the browser has zero automation fingerprints.
 * Returns a CDP endpoint URL to connect to.
 */
export async function spawnChrome(
  executablePath: string,
  profileDir: string,
  navigateTo: string,
): Promise<ChromeProcess> {
  const port = await findFreePort();
  fs.mkdirSync(profileDir, { recursive: true });

  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-session-crashed-bubble',
    '--disable-infobars',
    navigateTo,
  ];

  const proc = spawn(executablePath, args, {
    stdio: 'ignore',
    detached: false,
  });

  // Wait for Chrome to be ready on the debug port (up to 15s)
  await waitForCdpReady(port, 15_000);

  return { process: proc, cdpUrl: `http://127.0.0.1:${port}`, port };
}

// ─── CDP readiness poll ───────────────────────────────────────────────────────

async function waitForCdpReady(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return;
    } catch {
      // Not ready yet
    }
    await sleep(300);
  }
  throw new Error(`Chrome debug port ${port} did not become ready within ${timeoutMs}ms`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
