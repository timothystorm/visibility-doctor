import { chromium } from 'playwright';
import type { CheckFn } from './runner.js';
import type { StoredCookie } from '../types.js';
import { findSystemChrome } from '../auth/browser.js';

// Full page load thresholds: ≤ 3s GOOD PERFORMANCE · 3–5s SLOW PERFORMANCE · > 5s POOR PERFORMANCE
const SLOW_LOAD_MS = 3_000;
const POOR_LOAD_MS = 5_000;
const LOAD_TIMEOUT_MS = 30_000;
// Time after `load` for the SPA to execute its auth check and redirect if invalid
const AUTH_SETTLE_MS = 4_000;

function loadLabel(ms: number): string {
  if (ms <= SLOW_LOAD_MS) return 'GOOD PERFORMANCE';
  if (ms <= POOR_LOAD_MS) return 'SLOW PERFORMANCE';
  return 'POOR PERFORMANCE';
}

export const runPageCheck: CheckFn = async (env, session) => {
  const url = env.baseUrl;
  const cookies: StoredCookie[] = session?.cookies ?? [];

  const chromePath = findSystemChrome();
  if (!chromePath) {
    return {
      layer: 'page',
      status: 'failing',
      summary: 'Chrome not found — cannot run page check',
      detail: 'No Chrome installation found. Install Google Chrome and try again.',
    };
  }

  let browser;
  try {
    // Launch the real system Chrome — visible window so you can watch the auth
    // flow happen (or see a login redirect in real time). Real Chrome means real
    // timing: no bot-detection interference with page load measurements.
    browser = await chromium.launch({
      executablePath: chromePath,
      headless: false,
    });

    const context = await browser.newContext();

    // Inject session cookies so the SPA sees an authenticated user
    if (cookies.length > 0) {
      const { hostname } = new URL(url);
      const rootDomain = hostname.split('.').slice(-2).join('.');
      await context.addCookies(
        cookies
          .filter((c) => {
            const cd = c.domain.replace(/^\./, '');
            return rootDomain.endsWith(cd) || cd.endsWith(rootDomain);
          })
          .map((c) => ({
            name: c.name,
            value: c.value,
            domain: c.domain,
            path: c.path ?? '/',
            expires: c.expires ?? -1,
            httpOnly: c.httpOnly ?? false,
            secure: c.secure ?? false,
            sameSite: 'Lax' as const,
          })),
      );
    }

    const page = await context.newPage();
    const start = Date.now();

    await page.goto(url, { waitUntil: 'load', timeout: LOAD_TIMEOUT_MS });
    const loadMs = Date.now() - start;

    // Give the SPA time to execute its internal auth check API call and
    // redirect to the login page if the session is rejected.
    await page.waitForTimeout(AUTH_SETTLE_MS);
    const finalUrl = page.url();

    // Detect auth failure via login redirect
    const loginBase = new URL(env.loginUrl).origin + new URL(env.loginUrl).pathname;
    if (finalUrl.startsWith(loginBase)) {
      return {
        layer: 'page',
        status: 'failing',
        summary: 'Auth failed — SPA redirected to login',
        detail: `The page loaded but the app redirected to the login page (${finalUrl}). The SPA's internal auth check rejected the session cookies.`,
        nextSteps: [
          'Run `vdoc login` to capture a fresh session, then sweep again.',
          'If login just ran, verify cookieNames in config matches real cookie names.',
          'Check the auth API endpoint for errors in the browser network tab.',
        ],
      };
    }

    const label = loadLabel(loadMs);
    const summary = `${(loadMs / 1000).toFixed(1)}s  ${label}`;

    if (loadMs > POOR_LOAD_MS) {
      return {
        layer: 'page',
        status: 'failing',
        latencyMs: loadMs,
        summary,
        detail: `The page fully loaded in ${(loadMs / 1000).toFixed(1)}s — exceeds the ${POOR_LOAD_MS / 1000}s POOR threshold. Users are experiencing severe load delays.`,
        nextSteps: [
          'Compare Akamai edge latency to page load time.',
          'If edge is fast but load is slow: JS bundle size or slow API calls are likely the bottleneck.',
          'Check the network waterfall in browser devtools.',
        ],
      };
    }

    if (loadMs > SLOW_LOAD_MS) {
      return {
        layer: 'page',
        status: 'degraded',
        latencyMs: loadMs,
        summary,
        detail: `The page fully loaded in ${(loadMs / 1000).toFixed(1)}s — above the ${SLOW_LOAD_MS / 1000}s SLOW threshold.`,
        nextSteps: [
          'Run sweep again to confirm — may be transient.',
          'Check for slow backend API calls in the browser network tab.',
        ],
      };
    }

    return {
      layer: 'page',
      status: 'healthy',
      latencyMs: loadMs,
      summary,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const timedOut = msg.includes('Timeout') || msg.includes('timeout');
    return {
      layer: 'page',
      status: 'failing',
      summary: timedOut
        ? `Timed out after ${LOAD_TIMEOUT_MS / 1000}s`
        : `Browser load failed`,
      detail: msg,
      nextSteps: [
        timedOut
          ? 'Page did not finish loading. Check for hung API calls or JS errors.'
          : 'Unexpected browser error during page load.',
      ],
    };
  } finally {
    await browser?.close();
  }
};
