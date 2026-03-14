import type { CheckFn } from './runner.js';
import { sessionAge } from '../auth/session.js';

// Session age threshold — warn if cookies are older than this
const STALE_HOURS = 8;

export const runAuthCheck: CheckFn = async (_env, session) => {
  const start = Date.now();

  if (!session || session.cookies.length === 0) {
    return {
      layer: 'auth',
      status: 'failing',
      latencyMs: Date.now() - start,
      summary: 'No session — login required',
      detail:
        'No stored session cookies were found for this environment. ' +
        'Without valid cookies, all authenticated checks will fail.',
      nextSteps: [
        'Run `vdoc login` to open a browser window.',
        'Log in with your normal credentials — the tool will detect your session automatically.',
        'Once captured, re-run `vdoc` to sweep.',
      ],
    };
  }

  const now = Date.now();
  const hardExpired = session.cookies.some(
    (c) => c.expires !== undefined && c.expires * 1000 < now,
  );

  if (hardExpired) {
    return {
      layer: 'auth',
      status: 'failing',
      latencyMs: Date.now() - start,
      summary: 'Session cookies are expired',
      detail: 'One or more stored cookies have passed their expiry timestamp.',
      nextSteps: ['Run `vdoc login` to capture a fresh session.'],
    };
  }

  const { hours, minutes } = sessionAge(session);
  const ageLabel =
    hours > 0 ? `${hours}h ${minutes}m ago` : `${minutes}m ago`;

  if (hours >= STALE_HOURS) {
    return {
      layer: 'auth',
      status: 'degraded',
      latencyMs: Date.now() - start,
      summary: `Session is ${ageLabel} — may be stale`,
      detail: `The session was captured ${ageLabel}. ForgeRock sessions typically expire after a few hours. If authenticated checks fail, refresh with \`vdoc login\`.`,
      nextSteps: ['Run `vdoc login` to capture a fresh session if Page checks fail.'],
    };
  }

  return {
    layer: 'auth',
    status: 'healthy',
    latencyMs: Date.now() - start,
    summary: `Session active — ${session.cookies.length} cookie(s), captured ${ageLabel}`,
  };
};
