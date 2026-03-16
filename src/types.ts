// ─── Layer identifiers ───────────────────────────────────────────────────────

export type Layer =
  | 'auth'
  | 'akamai'
  | 'ping'
  | 'page';

// ─── Check result ─────────────────────────────────────────────────────────────

export type CheckStatus = 'pending' | 'running' | 'healthy' | 'degraded' | 'failing' | 'skipped';

export type CheckResult = {
  layer: Layer;
  status: Exclude<CheckStatus, 'pending' | 'running'>;
  /** Wall-clock milliseconds the check took */
  latencyMs?: number;
  /** One-liner shown in the layer card */
  summary: string;
  /** Expanded detail shown in the hotspot panel */
  detail?: string;
  /** Step-by-step instructions to narrow down the root cause */
  nextSteps?: string[];
};

// ─── Session / cookie storage ─────────────────────────────────────────────────

export type StoredCookie = {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
};

export type Session = {
  env: string;
  cookies: StoredCookie[];
  capturedAt: number; // unix ms
};
