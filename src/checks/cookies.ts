import type { StoredCookie } from '../types.js';

/**
 * Builds a Cookie request header value from stored session cookies,
 * filtered to only those whose domain matches the target URL.
 * Handles both exact-match and leading-dot wildcard domains (e.g. ".fedex.com").
 */
export function cookieHeaderForUrl(cookies: StoredCookie[], url: string): string {
  const { hostname } = new URL(url);
  return cookies
    .filter((c) => {
      const domain = c.domain.startsWith('.') ? c.domain.slice(1) : c.domain;
      return hostname === domain || hostname.endsWith('.' + domain);
    })
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');
}
