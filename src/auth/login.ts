import ora from 'ora';
import chalk from 'chalk';
import type { EnvConfig } from '../config/types.js';
import type { StoredCookie } from '../types.js';
import { findSystemChrome, chromeProfileDir, spawnChrome } from './browser.js';
import { saveSession, clearSession } from './session.js';

const LOGIN_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const POLL_INTERVAL_MS = 2_000;

// ─── Main login flow ──────────────────────────────────────────────────────────

export async function runLogin(envName: string, env: EnvConfig): Promise<boolean> {
  // 1. Find system Chrome
  const chromePath = findSystemChrome();
  if (!chromePath) {
    console.error(chalk.red('\n  ✗ Could not find a system Chrome installation.\n'));
    console.error('  Checked common paths for your OS. Please ensure Google Chrome');
    console.error('  (or Microsoft Edge) is installed and try again.\n');
    return false;
  }

  const profileDir = chromeProfileDir(envName);
  console.log(chalk.dim(`\n  Browser:  ${chromePath}`));
  console.log(chalk.dim(`  Profile:  ${profileDir}`));
  console.log(chalk.dim(`  Login at: ${env.loginUrl}\n`));

  // 2. Spawn Chrome directly as an OS process (no Playwright launch wrapper).
  //    This ensures zero automation fingerprints — ForgeRock sees a normal session.
  let chrome: Awaited<ReturnType<typeof spawnChrome>>;
  const launchSpinner = ora({ text: 'Launching browser…', color: 'cyan' }).start();

  try {
    chrome = await spawnChrome(chromePath, profileDir, env.loginUrl);
    launchSpinner.succeed(chalk.dim(`Browser ready on CDP port ${chrome.port}`));
  } catch (err) {
    launchSpinner.fail(chalk.red('Failed to launch browser.'));
    console.error(chalk.dim('  ' + String(err)));
    return false;
  }

  // 3. Connect via CDP — Playwright acts only as a thin debugging client.
  //    The browser itself was not launched by Playwright, so no automation flags.
  let context: import('playwright').BrowserContext;
  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.connectOverCDP(chrome.cdpUrl);
    context = browser.contexts()[0] ?? (await browser.newContext());
  } catch (err) {
    console.error(chalk.red('\n  ✗ Could not connect to browser via CDP.\n'));
    console.error(chalk.dim('  ' + String(err)));
    chrome.process.kill('SIGTERM' as NodeJS.Signals);
    return false;
  }

  // 4. Prompt the user
  console.log(chalk.cyan('\n  Browser is open — log in normally, then come back here.\n'));
  console.log(chalk.dim(`  Login signal:  waiting for cookies → ${env.cookieNames.join(', ')}`));
  console.log(chalk.dim(`  On detection:  all session cookies will be captured (not just these)`));
  console.log(chalk.dim(`  Timeout:       ${LOGIN_TIMEOUT_MS / 60_000} minutes\n`));

  // 5. Poll for the expected session cookies via CDP
  const spinner = ora({ text: 'Waiting for login…', color: 'cyan' }).start();
  const deadline = Date.now() + LOGIN_TIMEOUT_MS;

  const cookies = await new Promise<StoredCookie[] | null>((resolve) => {
    const interval = setInterval(async () => {
      if (Date.now() > deadline) {
        clearInterval(interval);
        resolve(null);
        return;
      }

      try {
        // Use configured cookies as a login completion signal only.
        // Once they're present, capture ALL cookies from the session — not just these.
        const urls = [...new Set([env.loginUrl, env.baseUrl])];
        const raw = await context.cookies(urls);

        const loginDetected = env.cookieNames.every((name) =>
          raw.some((c) => c.name === name && c.value),
        );

        if (loginDetected) {
          clearInterval(interval);
          // Map Playwright cookie shape → our StoredCookie shape
          resolve(
            raw.map((c) => ({
              name: c.name,
              value: c.value,
              domain: c.domain,
              path: c.path,
              expires: c.expires === -1 ? undefined : c.expires,
              httpOnly: c.httpOnly,
              secure: c.secure,
            })),
          );
        }
      } catch {
        // Context closed mid-poll — user closed the browser manually
        clearInterval(interval);
        resolve(null);
      }
    }, POLL_INTERVAL_MS);
  });

  // 6. Tear down and persist results
  try {
    chrome.process.kill('SIGTERM' as NodeJS.Signals);
  } catch {
    // Already exited
  }

  if (!cookies) {
    spinner.fail(chalk.red('Login not detected — timed out or browser was closed.'));
    console.log('\n  Run ' + chalk.cyan('vdoc login') + ' to try again.\n');
    clearSession(envName);
    return false;
  }

  saveSession(envName, cookies);
  spinner.succeed(chalk.green(`Login captured — ${cookies.length} cookie(s) stored for "${envName}".`));
  console.log(chalk.dim(`\n  Session saved to ~/.config/vis-doc/sessions/${envName}.json`));
  console.log('  Run ' + chalk.cyan('vdoc') + ' to start your sweep.\n');
  return true;
}
