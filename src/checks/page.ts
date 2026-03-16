import { chromium } from 'playwright';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import type { CheckFn } from './runner.js';
import type { StoredCookie } from '../types.js';
import { findSystemChrome, spawnChrome } from '../auth/browser.js';
import type { ChromeProcess } from '../auth/browser.js';

// Full page load thresholds: ≤ 3s GOOD PERFORMANCE · 3–5s SLOW PERFORMANCE · > 5s POOR PERFORMANCE
const SLOW_LOAD_MS = 3_000;
const POOR_LOAD_MS = 5_000;
const LOAD_TIMEOUT_MS = 30_000;
// Time after `load` for the SPA to execute its auth check and redirect if invalid
const AUTH_SETTLE_MS = 4_000;


/** Format a millisecond value as a fixed-2 seconds string, or 'n/a' if unavailable. */
function fmtMs(ms: number): string {
  return ms > 0 ? `${(ms / 1000).toFixed(2)}s` : 'n/a';
}

function buildSummary(ttfbMs: number, fcpMs: number, lcpMs: number, loadMs: number): string {
  return `ttfb: ${fmtMs(ttfbMs)}, fcp: ${fmtMs(fcpMs)}, window.onLoad: ${fmtMs(loadMs)}, lcp: ${fmtMs(lcpMs)}`;
}

interface PerfMetrics {
  ttfbMs: number;
  fcpMs: number;
  lcpMs: number;
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

  // Temp profile — unique per run, cleaned up in `finally`.
  const tempProfileDir = path.join(os.tmpdir(), `vdoc-page-${Date.now()}`);
  let chromeProc: ChromeProcess | undefined;
  let browser: import('playwright').Browser | undefined;

  try {
    // Spawn Chrome as a raw OS process so we hold a kill()-able handle.
    // Using connectOverCDP() instead of chromium.launch() means browser.close()
    // only disconnects the CDP session — it does NOT wait for the OS process to
    // exit. On Windows, chromium.launch()'s browser.close() hangs indefinitely
    // waiting for Chrome sub-processes to exit; an explicit process.kill() is
    // the only reliable teardown on both platforms.
    chromeProc = await spawnChrome(chromePath, tempProfileDir, 'about:blank');
    browser = await chromium.connectOverCDP(chromeProc.cdpUrl);

    const context = browser.contexts()[0] ?? (await browser.newContext());

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

    // Inject LCP observer before navigation so it captures the very first paint.
    // The observer stores the latest LCP candidate on window.__lcp (ms from navigation start).
    await page.addInitScript(() => {
      (window as any).__lcp = 0;
      try {
        const observer = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const last = entries[entries.length - 1];
          if (last) (window as any).__lcp = last.startTime;
        });
        observer.observe({ type: 'largest-contentful-paint', buffered: true });
      } catch (_) {
        // LCP API not supported in this browser/context — __lcp stays 0
      }
    });

    const start = Date.now();
    await page.goto(url, { waitUntil: 'load', timeout: LOAD_TIMEOUT_MS });
    const loadMs = Date.now() - start;

    // Give the SPA time to execute its internal auth check API call and
    // redirect to the login page if the session is rejected.
    await page.waitForTimeout(AUTH_SETTLE_MS);
    const finalUrl = page.url();

    // Collect Web Vitals from the browser's Performance APIs
    const { ttfbMs, fcpMs, lcpMs } = await page.evaluate((): PerfMetrics => {
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
      const paintEntry = performance.getEntriesByType('paint').find((e) => e.name === 'first-contentful-paint');
      return {
        ttfbMs: nav?.responseStart ?? 0,
        fcpMs: paintEntry?.startTime ?? 0,
        lcpMs: (window as any).__lcp ?? 0,
      };
    });

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

    const summary = buildSummary(ttfbMs, fcpMs, lcpMs, loadMs);

    if (loadMs > POOR_LOAD_MS) {
      return {
        layer: 'page',
        status: 'failing',
        latencyMs: loadMs,
        summary,
        detail: `Total load ${fmtMs(loadMs)} (ttfb ${fmtMs(ttfbMs)}, fcp ${fmtMs(fcpMs)}, lcp ${fmtMs(lcpMs)}) — exceeds the ${POOR_LOAD_MS / 1000}s POOR threshold. Users are experiencing severe load delays.`,
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
        detail: `Total load ${fmtMs(loadMs)} (ttfb ${fmtMs(ttfbMs)}, fcp ${fmtMs(fcpMs)}, lcp ${fmtMs(lcpMs)}) — above the ${SLOW_LOAD_MS / 1000}s SLOW threshold.`,
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
    // Disconnect the CDP client — non-blocking on both platforms.
    try { await browser?.close(); } catch { /* ignore */ }
    // Force-kill the Chrome OS process — the only reliable teardown on Windows.
    try { chromeProc?.process.kill(); } catch { /* already exited */ }
    // Best-effort profile cleanup (may fail if Chrome still holds file locks).
    try { fs.rmSync(tempProfileDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
};
