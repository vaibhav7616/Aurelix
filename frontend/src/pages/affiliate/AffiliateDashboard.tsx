import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { get, apiError } from '../../lib/api';
import { fmtMoney } from '../../lib/format';
import { Icon, Page, Panel, isoDay, usePrograms, useApprovedMe, type DayRow } from './shared';

type By = 'day' | 'week' | 'month';
interface ChartRow { period: string; clicks: number; registrations: number; ftd: number }
interface Dashboard {
  from: string; to: string; days: DayRow[];
  totals: { clicks: number; registrations: number; ftd: number; ftdSum: number; deposits: number; depositSum: number; commission: number };
  withdrawals: { count: number; sum: number };
  chart: ChartRow[];
  allTime: { total: number; revenue: number; volume: number; cpa: number; sub: number };
}

const SERIES: Array<{ key: keyof Omit<ChartRow, 'period'>; label: string; cls: string; dot: string }> = [
  { key: 'clicks', label: 'Clicks', cls: 'fill-accent-500', dot: 'bg-accent-500' },
  { key: 'registrations', label: 'Registrations', cls: 'fill-up', dot: 'bg-up' },
  { key: 'ftd', label: "FTD's", cls: 'fill-warn', dot: 'bg-warn' },
];

/** Grouped bars: clicks / registrations / first deposits per period, with hover readout. */
function ActivityChart({ rows, by }: { rows: ChartRow[]; by: By }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 720, H = 180;
  const max = Math.max(1, ...rows.flatMap((r) => SERIES.map((s) => r[s.key])));
  const gw = W / Math.max(1, rows.length);
  const bw = Math.max(1, Math.min(18, (gw * 0.8) / SERIES.length));
  const fmtP = (p: string) => (by === 'month' ? p : p.slice(5));
  const h = hover !== null ? rows[hover] : null;
  return (
    <figure className="min-w-0">
      <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-2 text-[11px] text-fog">
        {SERIES.map((s) => <span key={s.key} className="flex items-center gap-1.5"><span className={clsx('w-2.5 h-2.5 rounded-sm', s.dot)} />{s.label}</span>)}
        <span className="ml-auto ax-num">
          {h ? <>{by === 'week' ? `Week of ${h.period}` : h.period}: {SERIES.map((s) => `${s.label} ${h[s.key]}`).join(' · ')}</> : `${rows.length} ${by === 'day' ? 'days' : by === 'week' ? 'weeks' : 'months'}`}
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-[180px] block" role="img"
        aria-label={`Clicks, registrations and first deposits by ${by}`} onMouseLeave={() => setHover(null)}>
        {[0.25, 0.5, 0.75].map((f) => <line key={f} x1={0} x2={W} y1={H * f} y2={H * f} className="stroke-line" strokeWidth={1} vectorEffect="non-scaling-stroke" strokeDasharray="2 4" />)}
        {rows.map((r, i) => {
          const x0 = i * gw + (gw - bw * SERIES.length) / 2;
          return (
            <g key={r.period} className={clsx(hover !== null && hover !== i && 'opacity-50')}>
              {SERIES.map((s, j) => {
                const bh = (r[s.key] / max) * (H - 4);
                return <rect key={s.key} x={x0 + j * bw} y={H - bh} width={Math.max(0.5, bw - 1)} height={bh} className={s.cls} />;
              })}
              <rect x={i * gw} y={0} width={gw} height={H} fill="transparent" onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)} />
            </g>
          );
        })}
        <line x1={0} x2={W} y1={H - 0.5} y2={H - 0.5} className="stroke-base-600" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="flex justify-between text-[10px] text-mute mt-1 ax-num">
        <span>{rows[0] ? fmtP(rows[0].period) : ''}</span><span>{rows.length ? fmtP(rows[rows.length - 1].period) : ''}</span>
      </div>
    </figure>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="ax-panel p-4 min-w-0">
      <div className="ax-micro">{label}</div>
      <div className="text-[20px] font-semibold ax-num mt-1 truncate">{value}</div>
      {sub && <div className="text-[11px] text-mute mt-0.5 ax-num">{sub}</div>}
    </div>
  );
}

const FAST: Array<[string, string, string]> = [
  ['/affiliate/materials', 'Promo Materials', 'M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5M15 9h.01'],
  ['/affiliate/links', 'Links', 'M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1'],
  ['/affiliate/faq', 'FAQ', 'M12 21a9 9 0 100-18 9 9 0 000 18zM9.1 9a3 3 0 015.8 1c0 2-3 2.5-3 4M12 17h.01'],
  ['/affiliate/telegram', 'Telegram bot', 'M21 4L3 11l6 2 2 6 3-4 5 4zM9 13l12-9'],
  ['/affiliate/statistics', 'Statistics', 'M4 20V10M10 20V4M16 20v-6M22 20H2'],
];

const RANGES: Array<[number, string]> = [[7, '7 days'], [30, '30 days'], [90, '90 days'], [365, '1 year']];

export function AffiliateDashboard() {
  const me = useApprovedMe();
  const { data: programs } = usePrograms();
  const [from, setFrom] = useState(isoDay(6));
  const [to, setTo] = useState(isoDay(0));
  const [by, setBy] = useState<By>('day');
  const valid = !!from && !!to && from <= to;
  const dash = useQuery({
    queryKey: ['aff', 'dashboard', from, to, by],
    queryFn: () => get<Dashboard>(`/api/v1/affiliate/dashboard`, { from, to, by }),
    enabled: valid,
    refetchInterval: 60_000,
  });
  if (!me) return null;
  const d = dash.data;
  const lvl = me.level;
  const span = valid ? Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1 : 0;
  const showRev = programs?.revshareAvailable !== false;

  return (
    <Page title="Dashboard">
      {/* header strip */}
      <div className="ax-panel p-4 flex flex-wrap items-center gap-x-6 gap-y-3">
        <div>
          <div className="ax-micro">Earned</div>
          <div className="text-[24px] font-semibold ax-num text-cream">{d ? fmtMoney(d.allTime.total) : '—'}</div>
          <div className="text-[11px] text-mute ax-num">Vol: {d ? fmtMoney(d.allTime.volume) : '—'} / Rev: {d ? fmtMoney(d.allTime.revenue) : '—'}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {showRev && (
            <span className="ax-tag !h-auto py-1.5 px-2.5 text-[11px] bg-accent-500/15 text-accent-300">
              REVSHARE · LEVEL {lvl.level} · {lvl.revsharePct}%
            </span>
          )}
          <span className="ax-tag !h-auto py-1.5 px-2.5 text-[11px] bg-up/15 text-up">
            TURNOVER · LEVEL {lvl.level} · {lvl.turnoverPct}%
          </span>
        </div>
        <div className="text-[11px] text-mute min-w-[180px]">
          {me.nextLevel
            ? <>{me.depositsThisMonth}/{me.nextLevel.minDeposits} deposits this month → level {me.nextLevel.level} next month</>
            : <>Top level · {me.depositsThisMonth} deposits this month</>}
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_1fr_1.4fr] gap-2.5">
        <div className="ax-panel p-4 min-w-0 flex flex-col">
          <div className="ax-micro">Your balance</div>
          <div className={clsx('text-[24px] font-semibold ax-num mt-1', me.balance < 0 && 'text-down')}>{fmtMoney(me.balance)}</div>
          {me.held > 0 && <div className="text-[11px] text-warn ax-num">{fmtMoney(me.held)} on hold</div>}
          <Link to="/affiliate/withdrawal" className="ax-btn-primary mt-auto self-start !mt-3">Go to Withdrawal</Link>
        </div>
        <div className="ax-panel p-4 min-w-0">
          <div className="ax-micro">Earnings for all time</div>
          <div className="text-[24px] font-semibold ax-num mt-1">{d ? fmtMoney(d.allTime.total) : '—'}</div>
          {d && (
            <div className="text-[11px] text-mute mt-1 space-y-0.5 ax-num">
              {showRev && <div>Revenue Share: {fmtMoney(d.allTime.revenue)}</div>}
              <div>Turnover Share: {fmtMoney(d.allTime.volume)}</div>
              {d.allTime.cpa !== 0 && <div>CPA: {fmtMoney(d.allTime.cpa)}</div>}
              {d.allTime.sub !== 0 && <div>Sub-affiliates: {fmtMoney(d.allTime.sub)}</div>}
            </div>
          )}
        </div>
        <div className="ax-panel p-4 min-w-0">
          <div className="ax-micro mb-2">Fast links</div>
          <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-3 xl:grid-cols-5 gap-2">
            {FAST.map(([to2, label, icon]) => (
              <Link key={to2} to={to2} className="flex flex-col items-center gap-1.5 rounded-md border border-line bg-base-900 hover:bg-base-800 p-2.5 text-center text-[11px] text-fog hover:text-ink1 transition">
                <Icon d={icon} size={18} />{label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <Panel>
        <div className="flex flex-wrap items-end gap-3">
          <h2 className="text-sm font-semibold text-cream mr-auto">All statistics</h2>
          <div>
            <label htmlFor="db-from" className="ax-label">From</label>
            <input id="db-from" type="date" className="ax-input w-[150px]" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label htmlFor="db-to" className="ax-label">To</label>
            <input id="db-to" type="date" className="ax-input w-[150px]" value={to} min={from} max={isoDay(0)} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="ax-seg" role="group" aria-label="Quick range">
            {RANGES.map(([n, l]) => (
              <button key={n} type="button" className="ax-seg-btn px-2.5 whitespace-nowrap" data-active={span === n && to === isoDay(0)} aria-pressed={span === n && to === isoDay(0)} onClick={() => { setFrom(isoDay(n - 1)); setTo(isoDay(0)); }}>{l}</button>
            ))}
          </div>
        </div>
        {!valid && <p className="text-[11px] text-down mt-2">The start date must be before the end date.</p>}
        {dash.isError && <p className="text-xs text-down mt-3">{apiError(dash.error)}</p>}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2.5 mt-4">
          <Stat label="Deposits" value={d ? fmtMoney(d.totals.depositSum) : '—'} sub={d ? `${d.totals.deposits} deposits` : undefined} />
          <Stat label="Withdrawals" value={d ? fmtMoney(d.withdrawals.sum) : '—'} sub={d ? `${d.withdrawals.count} withdrawals` : undefined} />
          <Stat label="First deposits" value={d ? fmtMoney(d.totals.ftdSum) : '—'} sub={d ? `${d.totals.ftd} FTD's` : undefined} />
          <Stat label="Clicks" value={d ? String(d.totals.clicks) : '—'} />
          <Stat label="Registrations" value={d ? String(d.totals.registrations) : '—'} sub={d && d.totals.clicks ? `${((d.totals.registrations / d.totals.clicks) * 100).toFixed(1)}% of clicks` : undefined} />
        </div>
      </Panel>

      <Panel title="Clicks / Registrations / FTD — all links" right={
        <div className="ax-seg w-[200px]" role="tablist" aria-label="Group by">
          {(['month', 'week', 'day'] as By[]).map((b) => (
            <button key={b} role="tab" aria-selected={by === b} data-active={by === b} className="ax-seg-btn capitalize" onClick={() => setBy(b)}>{b}</button>
          ))}
        </div>
      }>
        {dash.isLoading ? <p className="text-xs text-mute py-10 text-center">Loading…</p> : d && <ActivityChart rows={d.chart} by={by} />}
      </Panel>
    </Page>
  );
}
