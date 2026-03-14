import axios from 'axios';
import type { CheckFn } from './runner.js';

const TIMEOUT_MS = 10_000;

// Checks that the server is reachable and the app is deployed correctly.
// No auth cookies — a 200 here only means the HTML shell was served.
// It does NOT indicate the user is logged in.
export const runPingCheck: CheckFn = async (env, _session) => {
  const url = env.baseUrl;
  const start = Date.now();

  try {
    const res = await axios.get(url, {
      timeout: TIMEOUT_MS,
      headers: { 'User-Agent': 'visibility-doctor/health-check', Accept: 'text/html' },
      maxRedirects: 10,
      validateStatus: () => true,
    });

    const pingMs = Date.now() - start;
    const s = res.status;

    if (s === 404) {
      return {
        layer: 'ping',
        status: 'failing',
        latencyMs: pingMs,
        summary: `404 — route not found`,
        detail: `${url} returned 404. The app route may not be deployed or the baseUrl in config is wrong.`,
      };
    }

    if (s >= 500) {
      return {
        layer: 'ping',
        status: 'failing',
        latencyMs: pingMs,
        summary: `${s} — server error`,
        detail: `HTTP ${s} from ${url}. This suggests a backend or deployment problem.`,
        nextSteps: ['Check recent deployments in GitHub Actions.'],
      };
    }

    if (s >= 400) {
      return {
        layer: 'ping',
        status: 'degraded',
        latencyMs: pingMs,
        summary: `${s} — unexpected client error`,
        detail: `HTTP ${s} from ${url}.`,
      };
    }

    return {
      layer: 'ping',
      status: 'healthy',
      latencyMs: pingMs,
      summary: `${s} — app is deployed correctly (${pingMs}ms)`,
    };
  } catch (err) {
    const pingMs = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    return {
      layer: 'ping',
      status: 'failing',
      latencyMs: pingMs,
      summary: msg.includes('timeout') ? `Timed out after ${TIMEOUT_MS / 1000}s` : `Unreachable — ${msg}`,
      detail: `Could not reach ${url}. Check DNS and network connectivity.`,
    };
  }
};
