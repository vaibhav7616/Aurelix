// Affiliate attribution kept in the browser between a tracking-link click and registration.
const KEY = 'ax_aff';
const SUB_KEY = 'ax_subref';
const MAX_AGE_MS = 30 * 86_400_000; // matches the server's default attribution window

export interface Attribution { aff: string; sub?: string; clickId?: string; at: number }

export function saveAttribution(a: Omit<Attribution, 'at'>): void {
  try { localStorage.setItem(KEY, JSON.stringify({ ...a, at: Date.now() })); } catch { /* storage off */ }
}

/** The stored click, if it is still inside the attribution window. */
export function readAttribution(): Attribution | null {
  try {
    const a = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Attribution | null;
    return a && Date.now() - a.at < MAX_AGE_MS ? a : null;
  } catch { return null; }
}

export function clearAttribution(): void {
  try { localStorage.removeItem(KEY); } catch { /* storage off */ }
}

/** Sub-affiliate invite: /affiliate?sub=CODE is remembered until the partner applies. */
export function captureSubAffiliateInvite(): void {
  try {
    const u = new URL(window.location.href);
    const sub = u.searchParams.get('sub');
    if (u.pathname.startsWith('/affiliate') && sub && /^[A-Za-z0-9]{4,16}$/.test(sub)) localStorage.setItem(SUB_KEY, sub.toUpperCase());
  } catch { /* storage off */ }
}

/** Partner link of the form https://site/any-page?lid=123[&sub=..][&click_id=..]: record the click once, remember it. */
export async function captureLinkClick(record: (body: { lid: string; sub?: string; clickId?: string }) => Promise<{ valid: boolean; code?: string; sub?: string | null }>): Promise<void> {
  try {
    const u = new URL(window.location.href);
    const lid = u.searchParams.get('lid');
    if (!lid || !/^\d{1,12}$/.test(lid) || u.pathname.startsWith('/affiliate')) return;
    const sub = u.searchParams.get('sub')?.slice(0, 64) || undefined;
    const clickId = u.searchParams.get('click_id')?.slice(0, 128) || undefined;
    ['lid', 'sub', 'click_id'].forEach((k) => u.searchParams.delete(k));
    window.history.replaceState(window.history.state, '', u.pathname + (u.search ? u.search : '') + u.hash);
    const r = await record({ lid, sub, clickId });
    if (r.valid && r.code) saveAttribution({ aff: r.code, sub: sub ?? r.sub ?? undefined, clickId });
  } catch { /* unknown link or offline: ignore */ }
}
