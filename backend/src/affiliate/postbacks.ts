// Server-to-server postbacks to the partner's tracker. Every URL is checked before each call so the
// platform can never be used to reach internal services (SSRF): http(s) only, no credentials, common
// ports only, and the host must resolve exclusively to public addresses. Each attempt is logged.
//
// Events: reg (registration), conf (email confirmed), ftd (first deposit), dep (repeat deposit),
// withdrawal. Macros: {status} {click_id} {event_id} {site_id} {lid} {trader_id} {sumdep}.
// GET puts parameters in the URL; POST sends them as a JSON body (the URL's own macros are filled too).
import { lookup } from 'dns/promises';
import { isIP } from 'net';
import { prisma } from '../config/database';

export const POSTBACK_EVENTS = ['reg', 'conf', 'ftd', 'dep', 'withdrawal'] as const;
export type PostbackEvent = (typeof POSTBACK_EVENTS)[number];
export const MACROS = ['status', 'click_id', 'event_id', 'site_id', 'lid', 'trader_id', 'sumdep'];

function privateIp(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80')) return true;
    const m = v.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return m ? privateIp(m[1]) : false;
  }
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

/** Throws a readable reason when the URL is not allowed. */
export async function assertSafeUrl(raw: string): Promise<URL> {
  let u: URL;
  try { u = new URL(raw.replace(/\{\w+\}/g, 'x')); } catch { throw new Error('Not a valid URL'); }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('Only http and https URLs are allowed');
  if (u.username || u.password) throw new Error('URLs with credentials are not allowed');
  if (u.port && !['80', '443', '8080', '8443'].includes(u.port)) throw new Error('Only ports 80, 443, 8080 and 8443 are allowed');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  const addrs = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
  if (!addrs.length) throw new Error('Host does not resolve');
  if (addrs.some(privateIp)) throw new Error('Private and internal addresses are not allowed');
  return u;
}

export function fillMacros(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? encodeURIComponent(vars[k]) : m));
}

async function call(postbackId: string, method: string, url: string, body: Record<string, string> | null): Promise<{ status: number | null; error: string | null }> {
  let status: number | null = null;
  let error: string | null = null;
  try {
    await assertSafeUrl(url);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    try {
      const res = await fetch(url, {
        method: method === 'POST' ? 'POST' : 'GET',
        redirect: 'manual',
        signal: ctrl.signal,
        headers: { 'User-Agent': 'Aurelix-Affiliate-Postback/1.0', ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}) },
        ...(method === 'POST' && body ? { body: JSON.stringify(body) } : {}),
      });
      status = res.status;
    } finally { clearTimeout(t); }
  } catch (e) {
    error = e instanceof Error ? e.message.slice(0, 200) : 'request failed';
  }
  await prisma.affiliatePostbackLog.create({ data: { postbackId, url: `${method} ${url}`.slice(0, 1000), status, error } }).catch(() => undefined);
  return { status, error };
}

function payload(event: string, statusMap: unknown, vars: Record<string, string>): Record<string, string> {
  const map = (statusMap && typeof statusMap === 'object' ? statusMap : {}) as Record<string, string>;
  return { click_id: '', event_id: '', site_id: '', lid: '', trader_id: '0', sumdep: '0', ...vars, status: map[event] || event };
}

/** Fire every active postback of this partner subscribed to the event (one retry on failure). */
export async function firePostbacks(affiliateId: string, event: string, vars: Record<string, string>): Promise<void> {
  const hooks = await prisma.affiliatePostback.findMany({ where: { affiliateId, active: true, events: { has: event } } });
  for (const h of hooks) {
    const p = payload(event, h.statusMap, vars);
    const url = fillMacros(h.url, p);
    const r = await call(h.id, h.method, url, h.method === 'POST' ? p : null);
    if (r.error || (r.status ?? 0) >= 500) setTimeout(() => void call(h.id, h.method, url, h.method === 'POST' ? p : null), 60_000).unref?.();
  }
}

/** "Send test" from the dashboard: a sample first-deposit event. */
export async function testPostback(h: { id: string; method: string; url: string; statusMap: unknown }) {
  const p = payload('ftd', h.statusMap, { click_id: 'test-click', event_id: 'test-event', site_id: 'test-site', lid: '100001', trader_id: '0', sumdep: '10.00' });
  return call(h.id, h.method, fillMacros(h.url, p), h.method === 'POST' ? p : null);
}
