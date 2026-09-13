import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { get } from '../../lib/api';
import { useTerminal } from '../../stores/terminalStore';
import { fmtMoney, fmtPrice, fmtTime } from '../../lib/format';
import { fmtDur, type OptionTrade } from '../../lib/options';
import { DirBadge, ResultBadge } from '../../components/trading/TradesPanel';
import { Empty } from '../../components/ui/primitives';
import { clsx } from 'clsx';

export function HistoryPage() {
  const { accountId } = useTerminal();
  const [result, setResult] = useState('');
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ['options', 'history', 'page', accountId, result, page],
    queryFn: () => get<{ items: OptionTrade[]; totalPages: number; total: number }>('/api/v1/options/history', { page, pageSize: 15, ...(accountId ? { accountId } : {}), ...(result ? { result } : {}) }),
  });
  const items = data?.items ?? [];
  const sum = items.reduce((a, t) => a + Number(t.profit ?? 0), 0);

  return (
    <div className="max-w-[1240px] mx-auto p-4">
      <div className="flex items-center gap-2 flex-wrap">
        <h1 className="text-lg font-bold tracking-tight mr-2">Trade history</h1>
        <select value={result} onChange={(e) => { setResult(e.target.value); setPage(1); }} className="ax-input !w-auto !h-8 !text-xs"><option value="">All results</option><option value="WON">Won</option><option value="LOST">Lost</option><option value="TIE">Tie</option></select>
        <span className="text-[11px] text-mute ml-auto ax-num">{data?.total ?? 0} trades · page P/L <span className={clsx('font-bold', sum > 0 ? 'text-up' : sum < 0 ? 'text-down' : 'text-fog')}>{sum > 0 ? '+' : ''}{fmtMoney(sum)}</span></span>
      </div>
      <div className="ax-panel mt-3 overflow-hidden">
        {isLoading ? <div className="p-3 space-y-2">{[1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-8" />)}</div>
          : !items.length ? <Empty title="No trades match" hint="Adjust the filter or open a trade from the terminal." />
            : (
              <div className="overflow-x-auto"><table className="w-full min-w-[900px]">
                <thead><tr>{['Asset', 'Direction', 'Investment', 'Payout', 'Entry', 'Close', 'Time', 'Result', 'Profit', 'Opened', 'Settled'].map((h) => <th key={h} className={clsx('ax-th', h === 'Profit' && 'text-right')}>{h}</th>)}</tr></thead>
                <tbody>{items.map((t) => (
                  <tr key={t.id} className="ax-row">
                    <td className="ax-td font-bold">{t.symbol}</td>
                    <td className="ax-td"><DirBadge d={t.direction} /></td>
                    <td className="ax-td ax-num">{fmtMoney(t.stake)}</td>
                    <td className="ax-td ax-num text-mute">{t.payoutPct}%</td>
                    <td className="ax-td ax-num text-fog">{fmtPrice(t.entryPrice)}</td>
                    <td className="ax-td ax-num text-fog">{t.closePrice != null ? fmtPrice(t.closePrice) : '—'}</td>
                    <td className="ax-td ax-num text-mute">{fmtDur(t.durationSec)}</td>
                    <td className="ax-td"><ResultBadge s={t.status} /></td>
                    <td className={clsx('ax-td ax-num font-bold text-right', (t.profit ?? 0) > 0 ? 'text-up' : (t.profit ?? 0) < 0 ? 'text-down' : 'text-fog')}>{(t.profit ?? 0) > 0 ? '+' : ''}{fmtMoney(t.profit ?? 0)}</td>
                    <td className="ax-td text-mute">{fmtTime(t.openedAt)}</td>
                    <td className="ax-td text-mute">{t.settledAt ? fmtTime(t.settledAt) : '—'}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
      </div>
      <div className="flex gap-2 mt-2.5 justify-end items-center">
        <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="ax-btn-ghost ax-btn-sm">← Prev</button>
        <span className="text-[11px] text-mute ax-num">Page {page} of {data?.totalPages ?? 1}</span>
        <button disabled={page >= (data?.totalPages ?? 1)} onClick={() => setPage((p) => p + 1)} className="ax-btn-ghost ax-btn-sm">Next →</button>
      </div>
    </div>
  );
}
