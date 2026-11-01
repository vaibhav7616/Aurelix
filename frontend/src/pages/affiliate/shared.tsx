import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { get } from '../../lib/api';
import { useUI } from '../../stores/uiStore';

// ── API types ───────────────────────────────────────────────────────────────────────

export type AffStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'BLOCKED';
export type Model = 'REVSHARE' | 'TURNOVER' | 'CPA';
export interface Level { level: number; minDeposits: number; revsharePct: number; turnoverPct: number; subPct: number }
export interface Affiliate {
  id: string; status: AffStatus; verified: boolean; country: string | null; trafficSources: string;
  payoutMethod: string | null; payoutDetails: Record<string, string> | null; subCode: string; note: string | null; createdAt: string;
}
export interface PayoutChecks { approved: boolean; verified: boolean; activeTraders: boolean; minBalance: boolean; payoutDetails: boolean }
export type AffMe =
  | { affiliate: null }
  | {
    affiliate: Affiliate; level: Level; nextLevel: Level | null; depositsThisMonth: number; projectedLevel: Level;
    balance: number; held: number; activeTraders: number; payoutChecks: PayoutChecks; payoutEligible: boolean;
    minActiveTraders: number; minPayout: number; nextPayoutAt: string;
  };
export type AffMeFull = Extract<AffMe, { affiliate: Affiliate }>;

export interface Programs {
  levels: Level[]; turnoverCapPctOfDeposits: number; subAffiliateCapUsd: number; minActiveTraders: number; minPayout: number;
  payoutWeekday: number; maxHoldDays: number; activeTraderMinTrades: number;
  cpa: { available: boolean; minFtd: number; withinDays: number; rates: Record<string, number> };
  revshareAvailable: boolean;
}
export interface DayRow { day: string; clicks: number; registrations: number; ftd: number; ftdSum: number; deposits: number; depositSum: number; commission: number }
export interface Trader {
  id: string; trader: string; model: Model; level: number; sharePct: number; link: string; linkId: string | null; subId: string | null;
  registeredAt: string; ftdAt: string | null; ftdAmount: number | null; depositTotal: number; active: boolean;
  status: 'ACTIVE' | 'SUSPICIOUS' | 'REJECTED'; commission: number;
}
export interface AffLink {
  id: string; num: number; code: string; name: string; model: Model; subId: string | null; landing: string; archived: boolean;
  createdAt: string; clicks: number; registrations: number; ftd: number;
}

export const AFF = '/api/v1/affiliate';

export function useAffMe() {
  return useQuery({ queryKey: ['aff', 'me'], queryFn: () => get<AffMe>(`${AFF}/me`), refetchInterval: 60_000 });
}
/** The signed-in partner's /me when approved (the shell only renders partner pages for approved partners). */
export function useApprovedMe(): AffMeFull | undefined {
  const { data } = useAffMe();
  return data && data.affiliate ? data : undefined;
}
export function usePrograms() {
  return useQuery({ queryKey: ['aff', 'programs'], queryFn: () => get<Programs>(`${AFF}/programs`), staleTime: 5 * 60_000 });
}
export function useLinks() {
  return useQuery({ queryKey: ['aff', 'links'], queryFn: () => get<AffLink[]>(`${AFF}/links`) });
}

// ── helpers ─────────────────────────────────────────────────────────────────────────

export const MODEL_LABEL: Record<string, string> = { REVSHARE: 'Revenue Share', TURNOVER: 'Turnover Share', CPA: 'CPA' };
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const trackingUrl = (code: string) => `${window.location.origin}/r/${code}`;
/** The partner-specific URL of a link: the landing page with the link's numeric id (?lid=). */
export const linkUrl = (l: { num: number; landing: string }) => `${window.location.origin}${l.landing === '/' ? '/' : l.landing}?lid=${l.num}`;
/** Human label of a link's landing page. */
export const LINK_TYPES: Array<[string, string]> = [['/', 'Main page'], ['/register', 'Register link'], ['/markets', 'Markets page'], ['/promotions', 'Promotions page']];
export const linkType = (landing: string) => LINK_TYPES.find(([v]) => v === landing)?.[1] ?? landing;
export const fmtDate = (s: string | null | undefined) => (s ? new Date(s).toISOString().slice(0, 10) : '—');
export const fmtDateTime = (s: string | null | undefined) => (s ? new Date(s).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : '—');
export const pct = (n: number, d: number) => (d > 0 ? `${((n / d) * 100).toFixed(1)}%` : '—');

/** "15–49" style deposit range for a level, given the full sorted list. */
export function levelRange(levels: Level[], i: number): string {
  const next = levels[i + 1];
  return next ? `${levels[i].minDeposits}–${next.minDeposits - 1}` : `${levels[i].minDeposits}+`;
}

/** YYYY-MM-DD in UTC, `daysAgo` days before today. */
export function isoDay(daysAgo = 0): string {
  return new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);
}

/** Clipboard with a fallback for plain-HTTP pages where navigator.clipboard is unavailable. */
export async function copyText(text: string): Promise<boolean> {
  try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; } } catch { /* fall back */ }
  const ta = document.createElement('textarea');
  ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  ta.remove();
  return ok;
}

export function CopyButton({ text, label = 'Copy', what = 'text', className, small = true }: { text: string; label?: string; what?: string; className?: string; small?: boolean }) {
  const push = useUI((s) => s.push);
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      aria-label={`Copy ${what}`}
      disabled={!text}
      className={clsx('ax-btn-ghost shrink-0', small && 'ax-btn-sm', className)}
      onClick={async () => {
        if (await copyText(text)) { setDone(true); setTimeout(() => setDone(false), 1800); }
        else push('err', `Could not copy the ${what} — select it and copy it manually`);
      }}
    >
      {done ? 'Copied' : label}
    </button>
  );
}

/** Client-side CSV download. */
export function downloadCsv(filename: string, header: string[], rows: Array<Array<string | number | null | undefined>>) {
  const esc = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [header, ...rows].map((r) => r.map(esc).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── UI pieces ───────────────────────────────────────────────────────────────────────

export function Icon({ d, size = 16 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

export function Page({ title, lead, right, children }: { title: string; lead?: ReactNode; right?: ReactNode; children: ReactNode }) {
  return (
    <div className="max-w-[1160px] mx-auto p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight text-cream">{title}</h1>
          {lead && <p className="text-xs text-mute mt-1 max-w-[720px] leading-relaxed">{lead}</p>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

export function Panel({ title, right, className, children, pad = true }: { title?: string; right?: ReactNode; className?: string; children: ReactNode; pad?: boolean }) {
  return (
    <section className={clsx('ax-panel min-w-0', pad && 'p-4', className)}>
      {(title || right) && (
        <div className={clsx('flex items-center gap-2 mb-3', !pad && 'px-4 pt-4')}>
          {title && <h2 className="ax-micro">{title}</h2>}
          {right && <div className="ml-auto">{right}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Kpi({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'up' | 'down' | 'warn' }) {
  return (
    <div className="ax-panel p-4 min-w-0">
      <div className="ax-micro">{label}</div>
      <div className={clsx('text-[20px] font-semibold ax-num mt-1 truncate', tone === 'up' ? 'text-up' : tone === 'down' ? 'text-down' : tone === 'warn' ? 'text-warn' : 'text-ink1')}>{value}</div>
      {sub && <div className="text-[11px] text-mute mt-1">{sub}</div>}
    </div>
  );
}

/** Horizontal scroll container for wide tables, so the page itself never scrolls sideways. */
export function TableWrap({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto">{children}</div>;
}

export function EmptyRow({ cols, text }: { cols: number; text: string }) {
  return <tr><td colSpan={cols} className="ax-td text-center text-mute py-6 whitespace-normal">{text}</td></tr>;
}

export function LoadingRow({ cols }: { cols: number }) {
  return <tr><td colSpan={cols} className="ax-td text-center text-mute py-6">Loading…</td></tr>;
}

export function StatusTag({ status }: { status: string }) {
  const tone: Record<string, string> = {
    APPROVED: 'bg-up/15 text-up', ACTIVE: 'bg-up/15 text-up', PAID: 'bg-up/15 text-up', ANSWERED: 'bg-up/15 text-up',
    PENDING: 'bg-warn/15 text-warn', REQUESTED: 'bg-warn/15 text-warn', OPEN: 'bg-warn/15 text-warn', SUSPICIOUS: 'bg-warn/15 text-warn',
    REJECTED: 'bg-down/15 text-down', BLOCKED: 'bg-down/15 text-down',
  };
  return <span className={clsx('ax-tag', tone[status])}>{status.charAt(0) + status.slice(1).toLowerCase()}</span>;
}

export function Check({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-xs">
      <span className={clsx('mt-[1px] shrink-0', ok ? 'text-up' : 'text-mute')} aria-hidden>
        <Icon d={ok ? 'M5 12l4 4 10-10' : 'M12 21a9 9 0 100-18 9 9 0 000 18z'} size={14} />
      </span>
      <span className={ok ? 'text-fog' : 'text-ink1'}><span className="sr-only">{ok ? 'Done: ' : 'Missing: '}</span>{children}</span>
    </li>
  );
}

export const MODELS: Model[] = ['REVSHARE', 'TURNOVER', 'CPA'];

/** Why a model cannot be chosen right now, or null if it can. */
export function modelBlocked(p: Programs | undefined, m: Model): string | null {
  if (!p) return null;
  if (m === 'REVSHARE' && !p.revshareAvailable) return 'Revenue Share is not offered in your country';
  if (m === 'CPA' && !p.cpa.available) return 'CPA is not available at the moment';
  return null;
}

export function ModelSelect({ value, onChange, programs, id }: { value: Model; onChange: (m: Model) => void; programs: Programs | undefined; id?: string }) {
  return (
    <select id={id} className="ax-input" value={value} onChange={(e) => onChange(e.target.value as Model)}>
      {MODELS.map((m) => {
        const why = modelBlocked(programs, m);
        return <option key={m} value={m} disabled={!!why}>{MODEL_LABEL[m]}{why ? ` — ${why}` : ''}</option>;
      })}
    </select>
  );
}

/** First model the partner may use (for form defaults). */
export function firstAllowedModel(p: Programs | undefined): Model {
  return MODELS.find((m) => !modelBlocked(p, m)) ?? 'TURNOVER';
}
