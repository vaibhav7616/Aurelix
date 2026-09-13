import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { get } from '../../lib/api';
import { useTerminal } from '../../stores/terminalStore';
import { fmtMoney, fmtPrice, fmtTime } from '../../lib/format';
import { fmtHMS, fmtDur, secondsLeft, previewOutcome, type OptionTrade } from '../../lib/options';
import { Empty, TableSkeleton } from '../ui/primitives';
import { clsx } from 'clsx';

function useNow(ms = 250) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

export function DirBadge({ d }: { d: 'UP' | 'DOWN' }) {
  return <span className={d === 'UP' ? 'ax-side-buy' : 'ax-side-sell'}>{d === 'UP' ? '▲ UP' : '▼ DOWN'}</span>;
}
export function ResultBadge({ s }: { s: OptionTrade['status'] }) {
  return (
    <span className={clsx('text-[10px] font-bold px-1.5 py-[3px] rounded', s === 'WON' && 'bg-up/15 text-up', s === 'LOST' && 'bg-down/15 text-down', s === 'TIE' && 'bg-white/[0.07] text-fog', s === 'OPEN' && 'bg-warn/15 text-warn')}>
      {s === 'OPEN' ? 'RUNNING' : s}
    </span>
  );
}

/** Ring countdown, Quotex-style. */
function Ring({ frac, tone }: { frac: number; tone: 'up' | 'down' | 'flat' }) {
  const r = 9; const c = 2 * Math.PI * r;
  const color = tone === 'up' ? '#3CB179' : tone === 'down' ? '#D4694E' : '#A9B5A4';
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" className="shrink-0 -rotate-90">
      <circle cx="12" cy="12" r={r} stroke="rgba(255,255,255,0.08)" strokeWidth="2.5" fill="none" />
      <circle cx="12" cy="12" r={r} stroke={color} strokeWidth="2.5" fill="none" strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(1, frac)))} strokeLinecap="round" />
    </svg>
  );
}

/** Compact card list — used in the right rail under the ticket (like Quotex's "Trades" tab). */
export function OpenTradesList({ accountId }: { accountId?: string | null }) {
  const { ticks } = useTerminal();
  const now = useNow();
  const { data, isLoading } = useQuery({
    queryKey: ['options', 'open', accountId],
    queryFn: () => get<OptionTrade[]>('/api/v1/options/open', accountId ? { accountId } : {}),
    refetchInterval: 3000,
  });
  if (isLoading) return <TableSkeleton rows={2} cols={2} />;
  if (!data?.length) {
    return (
      <div className="text-center py-8 px-4">
        <div className="mx-auto w-10 h-10 rounded-full bg-white/[0.06] border border-line flex items-center justify-center text-mute">◔</div>
        <div className="mt-2.5 text-[12px] font-semibold">No running trades</div>
        <div className="text-[11px] text-mute mt-1 leading-relaxed">Pick a time and an amount, then press <span className="text-up font-semibold">Up</span> or <span className="text-down font-semibold">Down</span>.</div>
      </div>
    );
  }
  return (
    <div className="divide-y divide-white/[0.06]">
      {data.map((t) => {
        const mark = ticks[t.symbol]?.mid;
        const left = secondsLeft(t.expiresAt, now);
        const frac = left / t.durationSec;
        const pv = previewOutcome(t, mark);
        const tone = pv === 'WON' ? 'up' : pv === 'LOST' ? 'down' : 'flat';
        return (
          <div key={t.id} className="px-3 py-2 flex items-center gap-2.5">
            <Ring frac={frac} tone={tone} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold">{t.symbol}</span>
                <DirBadge d={t.direction} />
              </div>
              <div className="text-[10px] text-mute ax-num mt-0.5">{fmtPrice(t.entryPrice)} → {mark ? fmtPrice(mark) : '…'} · {fmtDur(t.durationSec)}</div>
            </div>
            <div className="text-right">
              <div className={clsx('ax-num text-xs font-bold', tone === 'up' ? 'text-up' : tone === 'down' ? 'text-down' : 'text-fog')}>
                {pv === 'WON' ? `+${fmtMoney(t.stake * t.payoutPct / 100)}` : pv === 'LOST' ? `−${fmtMoney(t.stake)}` : fmtMoney(0)}
              </div>
              <div className="ax-num text-[10px] text-mute mt-0.5">{fmtHMS(left)}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Full-width table (positions tab in the workspace + /positions page). */
export function OpenTradesTable({ compact = false }: { compact?: boolean }) {
  const { accountId, ticks } = useTerminal();
  const now = useNow();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['options', 'open', accountId],
    queryFn: () => get<OptionTrade[]>('/api/v1/options/open', accountId ? { accountId } : {}),
    refetchInterval: 3000,
  });
  if (isLoading) return <TableSkeleton rows={3} cols={8} />;
  if (!data?.length) return <Empty title="No running trades" hint="Open a trade from the ticket — it appears here with a live countdown until expiry." action={<button onClick={() => refetch()} className="ax-btn-ghost ax-btn-sm">Refresh</button>} />;
  const atRisk = data.reduce((a, t) => a + t.stake, 0);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px]">
        <thead className="sticky top-0"><tr>{['Asset', 'Direction', 'Investment', 'Entry', 'Mark', 'Payout', 'Now', 'Expires in', compact ? '' : 'Opened'].map((h) => <th key={h} className={clsx('ax-th', (h === 'Payout' || h === 'Now') && 'text-right')}>{h}</th>)}</tr></thead>
        <tbody>
          {data.map((t) => {
            const mark = ticks[t.symbol]?.mid;
            const left = secondsLeft(t.expiresAt, now);
            const pv = previewOutcome(t, mark);
            return (
              <tr key={t.id} className="ax-row">
                <td className="ax-td font-bold text-[13px]">{t.symbol}</td>
                <td className="ax-td"><DirBadge d={t.direction} /></td>
                <td className="ax-td ax-num">{fmtMoney(t.stake)}</td>
                <td className="ax-td ax-num text-fog">{fmtPrice(t.entryPrice)}</td>
                <td className={clsx('ax-td ax-num', pv === 'WON' ? 'text-up' : pv === 'LOST' ? 'text-down' : '')}>{mark ? fmtPrice(mark) : '—'}</td>
                <td className="ax-td ax-num text-right text-fog">{t.payoutPct}% · {fmtMoney(t.stake * (1 + t.payoutPct / 100))}</td>
                <td className="ax-td text-right"><ResultBadge s={pv === 'OPEN' ? 'OPEN' : pv} /></td>
                <td className="ax-td ax-num font-semibold">
                  <span className="inline-flex items-center gap-1.5"><Ring frac={left / t.durationSec} tone={pv === 'WON' ? 'up' : pv === 'LOST' ? 'down' : 'flat'} />{fmtHMS(left)}</span>
                </td>
                {!compact && <td className="ax-td text-mute">{fmtTime(t.openedAt)}</td>}
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-line">
            <td colSpan={2} className="ax-td text-mute text-[11px] font-semibold uppercase tracking-wide">In trade · {data.length} running</td>
            <td className="ax-td ax-num font-bold">{fmtMoney(atRisk)}</td>
            <td colSpan={6} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/** Settled trades. */
export function TradeHistoryTable({ pageSize = 30, compact = false }: { pageSize?: number; compact?: boolean }) {
  const { accountId } = useTerminal();
  const { data, isLoading } = useQuery({
    queryKey: ['options', 'history', accountId, pageSize],
    queryFn: () => get<{ items: OptionTrade[] }>('/api/v1/options/history', { pageSize, ...(accountId ? { accountId } : {}) }),
    refetchInterval: 8000,
  });
  if (isLoading) return <TableSkeleton rows={3} cols={8} />;
  if (!data?.items.length) return <Empty title="No trade history yet" hint="Settled trades land here with their result and profit." />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px]">
        <thead><tr>{['Asset', 'Direction', 'Investment', 'Entry', 'Close', 'Time', 'Result', 'Profit', compact ? '' : 'Settled'].map((h) => <th key={h} className={clsx('ax-th', h === 'Profit' && 'text-right')}>{h}</th>)}</tr></thead>
        <tbody>
          {data.items.map((t) => (
            <tr key={t.id} className="ax-row">
              <td className="ax-td font-bold">{t.symbol}</td>
              <td className="ax-td"><DirBadge d={t.direction} /></td>
              <td className="ax-td ax-num">{fmtMoney(t.stake)}</td>
              <td className="ax-td ax-num text-fog">{fmtPrice(t.entryPrice)}</td>
              <td className="ax-td ax-num text-fog">{t.closePrice != null ? fmtPrice(t.closePrice) : '—'}</td>
              <td className="ax-td ax-num text-mute">{fmtDur(t.durationSec)}</td>
              <td className="ax-td"><ResultBadge s={t.status} /></td>
              <td className={clsx('ax-td ax-num font-bold text-right', (t.profit ?? 0) > 0 ? 'text-up' : (t.profit ?? 0) < 0 ? 'text-down' : 'text-fog')}>{(t.profit ?? 0) > 0 ? '+' : ''}{fmtMoney(t.profit ?? 0)}</td>
              {!compact && <td className="ax-td text-mute">{t.settledAt ? fmtTime(t.settledAt) : '—'}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
