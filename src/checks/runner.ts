import type { CheckResult, Layer, Session } from '../types.js';
import type { EnvConfig } from '../config/types.js';

// ─── Check contract ───────────────────────────────────────────────────────────

export type CheckFn = (
  env: EnvConfig,
  session: Session | null,
) => Promise<CheckResult>;

export type CheckUpdate = {
  layer: Layer;
  result: CheckResult;
};

// ─── Runner ───────────────────────────────────────────────────────────────────
// Auth runs serially first.
// Akamai + ping run in parallel (no auth needed).
// Page load runs last — it needs cookies and benefits from knowing ping passed.

export async function runSweep(
  env: EnvConfig,
  session: Session | null,
  onUpdate: (update: CheckUpdate) => void,
  onRunning?: (layer: Layer) => void,
): Promise<CheckResult[]> {
  const { runAuthCheck } = await import('./auth.js');
  const { runAkamaiCheck } = await import('./akamai.js');
  const { runPingCheck } = await import('./ping.js');
  const { runPageCheck } = await import('./page.js');

  const results: CheckResult[] = [];

  onRunning?.('auth');
  const authResult = await runAuthCheck(env, session);
  onUpdate({ layer: 'auth', result: authResult });
  results.push(authResult);

  // Akamai + ping in parallel — neither needs auth cookies
  onRunning?.('akamai');
  onRunning?.('ping');
  const [akamaiResult, pingResult] = await Promise.all([
    runAkamaiCheck(env, session).then((r) => { onUpdate({ layer: r.layer, result: r }); return r; }),
    runPingCheck(env, session).then((r) => { onUpdate({ layer: r.layer, result: r }); return r; }),
  ]);
  results.push(akamaiResult, pingResult);

  // Page load last — needs cookies, opens a real browser window
  onRunning?.('page');
  const pageResult = await runPageCheck(env, session);
  onUpdate({ layer: 'page', result: pageResult });
  results.push(pageResult);

  return results;
}

// ─── Hotspot detection ────────────────────────────────────────────────────────

export function findHotspots(results: CheckResult[]): CheckResult[] {
  return results.filter((r) => r.status === 'failing' || r.status === 'degraded');
}
