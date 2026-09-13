import { Link } from 'react-router-dom';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { get } from '../../lib/api';
import { useTerminal } from '../../stores/terminalStore';
import { Card, SectionTitle, Empty } from '../../components/ui/primitives';
import { fmtMoney, fmtPrice, fmtPct, clsUpDown, fmtTime } from '../../lib/format';
import { clsx } from 'clsx';

interface Stats { balance: number; available: number; equity: number }
interface OptStats { openTrades: number; inTrade: number; totalTrades: number; wins: number; losses: number; ties: number; winRate: number; todayPnl: number; totalPnl: number; turnover: number }
interface Account { id: string; accountNumber: string; accountType: string; balance: number }
interface Trade { id: string; symbol: string; direction: 'UP' | 'DOWN'; profit: number | null; status: string; settledAt: string | null; stake: number }
interface Asset { symbol: string; name: string; tick: { mid: number; changePct24h: number } | null }

function PerformancePanel() {
  const { data } = useQuery({
    queryKey: ['options', 'history', 'perf'],
    queryFn: () => get<{ items: Trade[] }>('/api/v1/options/history', { pageSize: 100 }),
    refetchInterval: 15000,
  });
  const trades = useMemo(() => [...(data?.items ?? [])].reverse(), [data]);
  if (!trades.length) return <Empty title="No performance data" hint="Close a trade to start building your equity curve." />;

  // cumulative equity curve
  let run = 0;
  const cum = trades.map((t) => { run += Number(t.profit ?? 0); return run; });
  const min = Math.min(0, ...cum); const max = Math.max(0, ...cum);
  const rng = max - min || 1;
  const W = 560; const H = 120;
  const X = (i: number) => 8 + (i / Math.max(1, cum.length - 1)) * (W - 16);
  const Y = (v: number) => 10 + (1 - (v - min) / rng) * (H - 20);
  const line = cum.map((v, i) => `${X(i)},${Y(v)}`).join(' ');
  const up = cum[cum.length - 1] >= 0;

  // daily bars, last 14 days
  const days: Array<{ key: string; label: string; v: number }> = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push({ key, label: d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' }), v: 0 });
  }
  for (const t of trades) {
    const k = new Date(t.settledAt ?? Date.now()).toISOString().slice(0, 10);
    const d = days.find((x) => x.key === k);
    if (d) d.v += Number(t.profit ?? 0);
  }
  const dMax = Math.max(0.01, ...days.map((d) => Math.abs(d.v)));

  return (
    <div className="grid md:grid-cols-[1.4fr_1fr] gap-4">
      <div>
        <div className="flex items-baseline justify-between">
          <span className="text-[11px] font-semibold text-mute uppercase tracking-wide">Equity curve</span>
          <span className={clsx('ax-num text-sm font-bold', clsUpDown(cum[cum.length - 1]))}>{fmtMoney(cum[cum.length - 1])}</span>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[120px] mt-1" preserveAspectRatio="none">
          <line x1="0" y1={Y(0)} x2={W} y2={Y(0)} stroke="#2D382E" strokeWidth="1" />
          <polygon points={`8,${Y(0)} ${line} ${X(cum.length - 1)},${Y(0)}`} fill={up ? 'rgba(60,177,121,0.12)' : 'rgba(212,105,78,0.12)'} />
          <polyline points={line} fill="none" stroke={up ? '#3CB179' : '#D4694E'} strokeWidth="1.5" />
          <circle cx={X(cum.length - 1)} cy={Y(cum[cum.length - 1])} r="2.5" fill={up ? '#3CB179' : '#D4694E'} />
        </svg>
      </div>
      <div>
        <span className="text-[11px] font-semibold text-mute uppercase tracking-wide">Daily P/L · 14d</span>
        <div className="flex items-end gap-[3px] h-[120px] mt-1">
          {days.map((d) => (
            <div key={d.key} title={`${d.label}: ${fmtMoney(d.v)}`} className="flex-1 flex flex-col justify-end h-full">
              <div className="flex-1" />
              <div
                className="w-full rounded-[2px]"
                style={{ height: `${Math.max(2, (Math.abs(d.v) / dMax) * 88)}%`, background: d.v >= 0 ? '#3CB179' : '#D4694E', opacity: d.v === 0 ? 0.25 : 0.9 }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Dashboard() {
  const { accountId, setAccountId } = useTerminal();
  const { data: accounts } = useQuery({ queryKey: ['accounts'], queryFn: () => get<Account[]>('/api/v1/accounts'), refetchInterval: 10000 });
  const id = accountId ?? accounts?.[0]?.id;
  const { data: s } = useQuery({ queryKey: ['stats', id], queryFn: () => get<Stats>(`/api/v1/accounts/${id}/stats`), enabled: !!id, refetchInterval: 5000 });
  const { data: o } = useQuery({ queryKey: ['option-stats', id], queryFn: () => get<OptStats>('/api/v1/options/stats', { accountId: id }), enabled: !!id, refetchInterval: 5000 });
  const { data: trades } = useQuery({ queryKey: ['options', 'history', 'recent', id], queryFn: () => get<{ items: Trade[] }>('/api/v1/options/history', { pageSize: 6, ...(id ? { accountId: id } : {}) }), refetchInterval: 10000 });
  const { data: assets } = useQuery({ queryKey: ['assets'], queryFn: () => get<{ assets: Asset[] }>('/api/v1/assets'), refetchInterval: 8000 });

  return (
    <div className="max-w-[1240px] mx-auto p-4 space-y-3">
      {/* account strip */}
      <div className="ax-panel px-4 py-3 flex items-center gap-4 flex-wrap">
        <div>
          <div className="ax-micro">Trading account</div>
          <div className="flex items-center gap-2 mt-1">
            <select value={id ?? ''} onChange={(e) => setAccountId(e.target.value)} className="h-8 bg-base-800 border border-line rounded-md text-xs font-bold px-2 outline-none cursor-pointer">
              {(accounts ?? []).map((a) => <option key={a.id} value={a.id}>{a.accountNumber}</option>)}
            </select>
          </div>
        </div>
        <div className="flex gap-6 ml-auto flex-wrap">
          {[
            ['Balance', s ? fmtMoney(s.balance) : '—', ''],
            ['In trade', o ? fmtMoney(o.inTrade) : '—', ''],
            ['Available', s ? fmtMoney(s.available) : '—', ''],
            ["Today's P/L", o ? fmtMoney(o.todayPnl) : '—', o ? clsUpDown(o.todayPnl) : ''],
            ['Total P/L', o ? fmtMoney(o.totalPnl) : '—', o ? clsUpDown(o.totalPnl) : ''],
          ].map(([l, v, c]) => (
            <div key={l as string} className="text-right">
              <div className="ax-micro">{l}</div>
              <div className={clsx('text-[17px] font-bold ax-num mt-0.5', c)}>{v}</div>
            </div>
          ))}
        </div>
        <Link to="/trading" className="ax-btn-primary">Trade →</Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          ['Running trades', o?.openTrades ?? '—', `${o?.totalTrades ?? 0} settled total`],
          ['Win rate', o ? `${o.winRate.toFixed(1)}%` : '—', `${o?.wins ?? 0}W / ${o?.losses ?? 0}L / ${o?.ties ?? 0}T`],
          ['Turnover', o ? fmtMoney(o.turnover) : '—', 'total invested (settled)'],
          ['Total trades', o?.totalTrades ?? '—', 'all-time settled'],
        ].map(([l, v, sub]) => (
          <div key={l as string} className="ax-panel px-3.5 py-3">
            <div className="ax-micro">{l}</div>
            <div className="text-[19px] font-bold ax-num mt-1">{v}</div>
            <div className="text-[11px] text-mute mt-1">{sub}</div>
          </div>
        ))}
      </div>

      <Card>
        <SectionTitle title="Performance" right={<Link to="/history" className="text-[11px] font-semibold text-accent-300 hover:underline">Trade history →</Link>} />
        <PerformancePanel />
      </Card>

      <div className="grid lg:grid-cols-[1fr_320px] gap-3">
        <Card className="!p-0 overflow-hidden">
          <div className="px-3.5 pt-3"><SectionTitle title="Recent trades" right={<Link to="/history" className="text-[11px] font-semibold text-accent-300 hover:underline">Full history →</Link>} /></div>
          {!trades?.items.length ? <Empty title="No trades yet" hint="Settled trades land here with their result." /> : (
            <table className="w-full">
              <thead><tr>{['Asset', 'Direction', 'Result', 'Profit', 'Settled'].map((h) => <th key={h} className={clsx('ax-th', h === 'Profit' && 'text-right')}>{h}</th>)}</tr></thead>
              <tbody>{trades.items.map((t) => (
                <tr key={t.id} className="ax-row">
                  <td className="ax-td font-bold">{t.symbol}</td>
                  <td className="ax-td"><span className={t.direction === 'UP' ? 'ax-side-buy' : 'ax-side-sell'}>{t.direction === 'UP' ? '▲ UP' : '▼ DOWN'}</span></td>
                  <td className="ax-td"><span className={clsx('text-[10px] font-bold px-1.5 py-[3px] rounded', t.status === 'WON' ? 'bg-up/15 text-up' : t.status === 'LOST' ? 'bg-down/15 text-down' : 'bg-white/[0.07] text-fog')}>{t.status}</span></td>
                  <td className={clsx('ax-td ax-num font-bold text-right', clsUpDown(t.profit ?? 0))}>{(t.profit ?? 0) > 0 ? '+' : ''}{fmtMoney(t.profit ?? 0)}</td>
                  <td className="ax-td text-mute">{t.settledAt ? fmtTime(t.settledAt) : '—'}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </Card>
        <Card className="!p-0 overflow-hidden">
          <div className="px-3.5 pt-3"><SectionTitle title="Market overview" right={<Link to="/markets-app" className="text-[11px] font-semibold text-accent-300 hover:underline">All →</Link>} /></div>
          <div>
            {(assets?.assets ?? []).map((a) => (
              <Link key={a.symbol} to="/trading" className="flex items-center px-3.5 py-[9px] border-b border-white/[0.06] hover:bg-white/[0.04]">
                <span className="text-xs font-bold">{a.symbol}</span>
                <span className="ml-auto ax-num text-xs font-semibold">{a.tick ? fmtPrice(a.tick.mid) : '—'}</span>
                <span className={clsx('ax-num text-[11px] font-bold w-[62px] text-right', clsUpDown(a.tick?.changePct24h))}>{fmtPct(a.tick?.changePct24h)}</span>
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
