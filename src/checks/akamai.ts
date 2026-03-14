import dns from 'node:dns/promises';
import axios from 'axios';
import type { CheckFn } from './runner.js';

const REQUEST_TIMEOUT_MS = 10_000;

// Akamai presence signals — any of these in response headers = Akamai confirmed
const AKAMAI_HEADER_PATTERNS = [
  'x-check-cacheable',
  'x-cache',
  'akamai-cache-status',
  'x-akamai-request-id',
  'x-akamai-ssl-client-sid',
  'x-akamai-transformed',
  'akamai-grn',
  'true-client-ip',
];

export const runAkamaiCheck: CheckFn = async (env, _session) => {
  const { hostname } = new URL(env.baseUrl);

  // ── 1. DNS resolution ─────────────────────────────────────────────────────
  let dnsMs: number;
  try {
    const dnsStart = Date.now();
    await dns.lookup(hostname);
    dnsMs = Date.now() - dnsStart;
  } catch (err) {
    return {
      layer: 'akamai',
      status: 'failing',
      summary: `DNS failed — ${hostname}`,
      detail: `Could not resolve ${hostname}: ${String(err)}`,
      nextSteps: [
        'Check if the hostname is correct in your config.',
        'Verify network/VPN connectivity.',
      ],
    };
  }

  // ── 2. HTTP probe — check for Akamai edge headers ────────────────────────
  let headers: Record<string, string> = {};
  let httpStatus: number;
  let edgeMs: number;

  try {
    const edgeStart = Date.now();
    const res = await axios.get(env.baseUrl, {
      timeout: REQUEST_TIMEOUT_MS,
      headers: { 'User-Agent': 'visibility-doctor/health-check' },
      validateStatus: () => true,
      maxRedirects: 5,
    });
    edgeMs = Date.now() - edgeStart;
    httpStatus = res.status;
    headers = Object.fromEntries(
      Object.entries(res.headers as Record<string, unknown>).map(([k, v]) => [
        k.toLowerCase(),
        String(v),
      ]),
    );
  } catch (err) {
    return {
      layer: 'akamai',
      status: 'failing',
      summary: `Edge unreachable — ${hostname}`,
      detail: `DNS resolved in ${dnsMs}ms but the HTTP request failed: ${String(err)}`,
      nextSteps: ['Check Akamai control center for edge health events.'],
    };
  }

  // ── 3. Detect Akamai presence ─────────────────────────────────────────────
  const akamaiHeaders = AKAMAI_HEADER_PATTERNS.filter((h) => h in headers);
  const akamaiPresent = akamaiHeaders.length > 0;

  // ── 4. Cache status ───────────────────────────────────────────────────────
  const cacheHeader =
    headers['x-check-cacheable'] ??
    headers['akamai-cache-status'] ??
    headers['x-cache'] ??
    null;
  const cacheLabel = cacheHeader ? ` • cache: ${cacheHeader}` : '';

  // ── 5. WAF / block detection ──────────────────────────────────────────────
  if (httpStatus === 403 && akamaiPresent) {
    return {
      layer: 'akamai',
      status: 'failing',
      latencyMs: edgeMs,
      summary: `403 blocked by Akamai WAF`,
      detail: `Akamai returned 403. This typically means the WAF policy is blocking the request. This may be intentional (IP-based rule) or a misconfiguration.`,
      nextSteps: [
        'Check if your IP is in an Akamai allowlist.',
        'Review WAF policy rules in Akamai Control Center.',
        'Try from a different network to rule out IP-based blocking.',
      ],
    };
  }

  if (!akamaiPresent) {
    return {
      layer: 'akamai',
      status: 'degraded',
      latencyMs: edgeMs,
      summary: `No Akamai headers detected — may be bypassed`,
      detail: `The response from ${hostname} showed no recognizable Akamai headers. Requests may be hitting the origin directly, bypassing the CDN and WAF.`,
      nextSteps: [
        'Verify DNS is pointing to an Akamai edge IP (not the origin).',
        'Check Akamai property configuration.',
      ],
    };
  }

  const summary = `Akamai confirmed — DNS ${dnsMs}ms • edge ${edgeMs}ms${cacheLabel}`;

  return {
    layer: 'akamai',
    status: 'healthy',
    latencyMs: edgeMs,
    summary,
  };
};
