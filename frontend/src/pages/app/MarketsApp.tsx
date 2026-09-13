import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { get } from '../../lib/api';
import { useTerminal } from '../../stores/terminalStore';
import { fmtPrice, fmtPct, clsUpDown } from '../../lib/format';
import { clsx } from 'clsx';

interface Asset { symbol: string; name: string; category: string; enabled: boolean; payoutPct?: number; tick: { mid: number; bid: number; ask: number; changePct24h: number } | null }

export function MarketsApp() {
  const { ticks, setSymbol } = useTerminal();
  const { data } = useQuery({
    queryKey: ['assets'],
    queryFn: () => get<{ assets: Asset[] }>('/api/v1/assets'),
    refetchInterval: 5000,
  });
  const assets = data?.assets ?? [];
  return (
    <div className="max-w-[1100px] mx-auto p-4">
      <div className="flex items-center gap-2.5">
        <h1 className="text-lg font-bold tracking-tight">Markets</h1>
      </div>
      <div className="ax-panel mt-3 overflow-hidden">
        <table className="w-full">
          <thead><tr>{['Instrument', 'Payout', 'Last', '24h', 'Bid', 'Ask', 'Status', ''].map((h) => <th key={h} className={clsx('ax-th', (h === 'Last' || h === '24h') && 'text-right')}>{h}</th>)}</tr></thead>
          <tbody>
            {assets.map((a) => {
              const live = ticks[a.symbol];
              const mid = live?.mid ?? a.tick?.mid ?? 0;
              const chg = live?.changePct24h ?? a.tick?.changePct24h ?? 0;
              return (
                <tr key={a.symbol} className="ax-row cursor-pointer" onClick={() => setSymbol(a.symbol)}>
                  <td className="ax-td"><span className="font-bold text-[13px]">{a.symbol}</span><span className="text-mute text-[11px] ml-2">{a.category}</span></td>
                  <td className="ax-td"><span className="ax-tag !text-warn !border-warn/40 ax-num">{a.payoutPct ?? '—'}%</span></td>
                  <td className="ax-td ax-num font-bold text-[13px] text-right">{mid ? fmtPrice(mid) : '—'}</td>
                  <td className={clsx('ax-td ax-num font-semibold text-right', clsUpDown(chg))}>{fmtPct(chg)}</td>
                  <td className="ax-td ax-num text-fog">{live ? fmtPrice(live.bid) : a.tick ? fmtPrice(a.tick.bid) : '—'}</td>
                  <td className="ax-td ax-num text-fog">{live ? fmtPrice(live.ask) : a.tick ? fmtPrice(a.tick.ask) : '—'}</td>
                  <td className="ax-td">{a.enabled ? <span className="text-up text-[11px] font-semibold">● Live</span> : <span className="text-down text-[11px] font-semibold">● Halted</span>}</td>
                  <td className="ax-td text-right" onClick={(e) => e.stopPropagation()}>
                    <Link to="/trading" onClick={() => setSymbol(a.symbol)} className="ax-btn-ghost ax-btn-sm">Trade →</Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
